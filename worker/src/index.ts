import type { Env } from './env';
import { verifySignature } from './signature';
import { loadUserProfile, loadWhatsappAccount } from './tenant';
import { setDoc } from './firestore';
import { markAsRead } from './whatsapp';
import { handleInboundMessage } from './bot';
import { verifyFirebaseIdToken } from './verifyIdToken';
import { completeEmbeddedSignup, WhatsappConnectError, type EmbeddedSignupInput } from './whatsappConnect';
import type { WebhookBody, WebhookValue } from './types';

/**
 * Two unrelated kinds of traffic land on this Worker, split by path:
 *
 * - `/` — Meta's own traffic (webhook verification + inbound messages),
 *   verified by X-Hub-Signature-256. This is the Cloud Functions webhook's
 *   direct replacement; unchanged since Sprint 1.
 * - `/embedded-signup/exchange` — the web app's own traffic, once a
 *   merchant finishes the Embedded Signup popup. Verified by a Firebase ID
 *   token instead, since there's no Meta signature on a request that never
 *   came from Meta. See verifyIdToken.ts for why that's possible with no
 *   Admin SDK, and whatsappConnect.ts for what happens after.
 *
 * Firestore is reached over its REST API either way (firestore.ts /
 * firestoreAuth.ts) — nothing here runs the Admin SDK.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/embedded-signup/exchange') {
      if (request.method === 'OPTIONS') return corsPreflight();
      if (request.method === 'POST') return handleEmbeddedSignupExchange(request, env);
      return new Response('Method not allowed', { status: 405 });
    }

    if (request.method === 'GET') return handleVerification(request, env);
    if (request.method === 'POST') return handleWebhook(request, env, ctx);
    return new Response('Method not allowed', { status: 405 });
  },
};

/* --------------------------- Meta webhook traffic -------------------------- */

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

/* ------------------------ Embedded Signup callback ------------------------- */

// Reflects the caller's origin rather than a fixed allowlist — the real
// access control here is the Firebase ID token, not CORS (which is only
// ever a browser-side convenience, never a security boundary on its own).
// Tighten this to your web app's actual origin(s) once you have a fixed
// production domain, if you want defense in depth.
function corsHeaders(request: Request): HeadersInit {
  return {
    'Access-Control-Allow-Origin': request.headers.get('origin') ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    Vary: 'Origin',
  };
}

function corsPreflight(): Response {
  return new Response(null, { status: 204 });
}

function jsonResponse(request: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

/**
 * Authenticates the merchant (Firebase ID token — see verifyIdToken.ts),
 * confirms they're an owner/admin of their org (same bar requireAdmin sets
 * for Cloud Functions callables), then hands off to whatsappConnect.ts for
 * the actual Meta exchange + Firestore write.
 *
 * The request body carries `organizationId` too, not just `code` — but it
 * is never trusted on its own. It's checked against the org the verified ID
 * token actually resolves to (via `users/{uid}`) and rejected on mismatch;
 * the token-derived org is what every write below actually uses. Accepting
 * a client-claimed org id with no such check would let any signed-in user
 * hijack another business's WhatsApp connection by passing its id — a
 * request body isn't itself a security boundary, only proof of identity is.
 *
 * `phoneNumberId`/`businessAccountId` also ride along: Meta's OAuth
 * exchange response never includes them (see whatsappConnect.ts), only
 * `access_token` — they only exist because the Embedded Signup postMessage
 * event handed them to the browser, so the browser is the only place they
 * can come from.
 */
async function handleEmbeddedSignupExchange(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('authorization') ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!idToken) return jsonResponse(request, 401, { error: 'Sign in first.' });

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch (err) {
    console.warn('ID token verification failed', err);
    return jsonResponse(request, 401, { error: 'Your session expired — sign in again.' });
  }

  const profile = await loadUserProfile(env, uid);
  if (!profile) return jsonResponse(request, 403, { error: 'This account has no business yet.' });
  if (!['owner', 'admin'].includes(profile.role)) {
    return jsonResponse(request, 403, { error: 'Only owners and admins can connect WhatsApp.' });
  }

  let input: EmbeddedSignupInput;
  try {
    const body = (await request.json()) as Partial<EmbeddedSignupInput> & { organizationId?: string };
    if (!body.code || !body.phoneNumberId || !body.businessAccountId || !body.organizationId) {
      return jsonResponse(request, 400, { error: 'Check the values from the signup flow.' });
    }
    if (body.organizationId !== profile.orgId) {
      return jsonResponse(request, 403, { error: "That organization doesn't match your signed-in account." });
    }
    input = { code: body.code, phoneNumberId: body.phoneNumberId, businessAccountId: body.businessAccountId };
  } catch {
    return jsonResponse(request, 400, { error: 'Malformed request.' });
  }

  try {
    const result = await completeEmbeddedSignup(env, profile.orgId, input);
    return jsonResponse(request, 200, { ok: true, ...result });
  } catch (err) {
    if (err instanceof WhatsappConnectError) return jsonResponse(request, 400, { error: err.message });
    console.error('Embedded Signup exchange failed', err);
    return jsonResponse(request, 500, { error: 'Something went wrong connecting WhatsApp. Try again.' });
  }
}
