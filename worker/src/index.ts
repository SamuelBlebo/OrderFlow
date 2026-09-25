import type { Env } from './env';
import { verifySignature } from './signature';
import { loadWhatsappAccount } from './tenant';
import { setDoc } from './firestore';
import { markAsRead } from './whatsapp';
import { handleInboundMessage } from './bot';
import type { WebhookBody, WebhookValue } from './types';

/**
 * Single public entry point for every merchant — the Cloudflare Worker
 * replacement for functions/src/whatsapp/webhook.ts. The receiving
 * phone_number_id decides which tenant a message belongs to; nothing else
 * is trusted. Runs with no Firebase Cloud Functions involved: Firestore is
 * reached over its REST API (see firestore.ts / firestoreAuth.ts).
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'GET') return handleVerification(request, env);
    if (request.method === 'POST') return handleWebhook(request, env, ctx);
    return new Response('Method not allowed', { status: 405 });
  },
};

/** Meta's one-time subscription handshake — GET with hub.mode/hub.verify_token/hub.challenge. */
function handleVerification(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return new Response('Verification failed', { status: 403 });
}

async function handleWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const raw = await request.text();
  const signatureOk = await verifySignature(raw, request.headers.get('x-hub-signature-256'), env.META_APP_SECRET);
  if (!signatureOk) {
    console.warn('Rejected webhook with bad signature');
    return new Response('Invalid signature', { status: 401 });
  }

  // Meta retries anything not answered within seconds — acknowledge first,
  // let processing continue in the background via waitUntil, and let
  // failures surface in `wrangler tail` instead of causing retry storms.
  ctx.waitUntil(processBody(raw, env));
  return new Response('EVENT_RECEIVED', { status: 200 });
}

async function processBody(raw: string, env: Env): Promise<void> {
  try {
    const body = JSON.parse(raw) as WebhookBody;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        await processChange(change.value, env);
      }
    }
  } catch (err) {
    console.error('Webhook processing failed', err);
  }
}

async function processChange(value: WebhookValue | undefined, env: Env): Promise<void> {
  const messages = value?.messages ?? [];
  if (messages.length === 0) return; // delivery receipts and read statuses

  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const account = await loadWhatsappAccount(env, phoneNumberId);
  if (!account) {
    console.warn('Inbound message for an unknown number', phoneNumberId);
    return;
  }

  // The Graph API probe at connect-time confirms the token works; this is
  // proof the webhook itself is actually receiving that account's traffic.
  if (account.webhookStatus !== 'verified') {
    await setDoc(env, `whatsappAccounts/${phoneNumberId}`, { webhookStatus: 'verified' }, { merge: ['webhookStatus'] });
  }

  const profileName = value?.contacts?.[0]?.profile?.name ?? '';

  for (const message of messages) {
    try {
      await markAsRead(env, account, message.id);
      await handleInboundMessage(env, account, message, profileName);
    } catch (err) {
      console.error('Bot failed on a message', account.organizationId, message.id, err);
    }
  }
}
