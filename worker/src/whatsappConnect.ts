import type { Env } from './env';
import { batchGet, beginTransaction, commitTransaction, type TransactionWrite } from './firestore';

/**
 * The backend half of Meta's WhatsApp Embedded Signup — everything that
 * happens after the merchant finishes the hosted popup and the browser has
 * a `code` plus the phone/WABA id they picked inside it. Runs entirely on
 * the Worker, never Cloud Functions: the access token this produces never
 * needs to leave here.
 *
 * Steps 9-12 of the flow (see worker/README.md and PLATFORM_SETUP.md):
 * exchange the code for a token, probe the number, subscribe this app to
 * the WABA's webhook notifications, and claim the number for this org —
 * same one-tenant-per-number guarantee the old manual-entry path had,
 * reimplemented here with a real Firestore transaction since there's no
 * Admin SDK to hand that guarantee to us for free.
 *
 * The OAuth code-exchange and subscribed_apps calls below follow Meta's
 * documented Embedded Signup flow as of writing — verify against Meta's
 * current docs with a real Meta App before relying on this in production;
 * it has not been exercised against one.
 */

export interface EmbeddedSignupInput {
  code: string;
  phoneNumberId: string;
  businessAccountId: string;
}

export interface EmbeddedSignupResult {
  displayPhone: string;
  qualityRating: string | null;
}

export class WhatsappConnectError extends Error {}

async function exchangeCodeForToken(env: Env, code: string): Promise<string> {
  const tokenUrl = new URL(`https://graph.facebook.com/${env.GRAPH_VERSION}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', env.META_APP_ID);
  tokenUrl.searchParams.set('client_secret', env.META_APP_SECRET);
  tokenUrl.searchParams.set('code', code);

  const response = await fetch(tokenUrl);
  if (!response.ok) {
    console.error('Embedded Signup code exchange failed', response.status, await response.text());
    throw new WhatsappConnectError('Meta rejected that signup code.');
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new WhatsappConnectError('Meta did not return an access token.');
  return body.access_token;
}

async function probePhoneNumber(
  env: Env,
  phoneNumberId: string,
  accessToken: string,
): Promise<{ displayPhone: string; verifiedName: string | null; qualityRating: string | null }> {
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new WhatsappConnectError('Meta rejected that phone number.');
  const body = (await response.json()) as {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
  };
  if (!body.display_phone_number) throw new WhatsappConnectError('Meta did not return a phone number for that id.');
  return {
    displayPhone: body.display_phone_number,
    verifiedName: body.verified_name ?? null,
    qualityRating: body.quality_rating ?? null,
  };
}

/** Without this, Meta never forwards this WABA's messages to our webhook — a step the old manual-entry flow had no equivalent for, since a merchant pasting their own token had presumably already done it themselves. */
async function subscribeToWaba(env: Env, businessAccountId: string, accessToken: string): Promise<void> {
  const url = `https://graph.facebook.com/${env.GRAPH_VERSION}/${businessAccountId}/subscribed_apps`;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    console.error('WABA subscribe failed', response.status, await response.text());
    throw new WhatsappConnectError("Connected, but couldn't subscribe to message notifications. Try again.");
  }
}

export async function completeEmbeddedSignup(
  env: Env,
  orgId: string,
  input: EmbeddedSignupInput,
): Promise<EmbeddedSignupResult> {
  const accessToken = await exchangeCodeForToken(env, input.code);
  const { displayPhone, verifiedName, qualityRating } = await probePhoneNumber(env, input.phoneNumberId, accessToken);
  await subscribeToWaba(env, input.businessAccountId, accessToken);

  const accountPath = `whatsappAccounts/${input.phoneNumberId}`;
  const transaction = await beginTransaction(env);
  const reads = await batchGet(env, [accountPath], transaction);

  const existing = reads[accountPath];
  if (existing && existing.organizationId !== orgId) {
    throw new WhatsappConnectError('That number is already connected to another business.');
  }

  const now = new Date();
  const writes: TransactionWrite[] = [
    {
      kind: 'set',
      path: accountPath,
      data: {
        organizationId: orgId,
        phoneNumberId: input.phoneNumberId,
        businessAccountId: input.businessAccountId,
        displayPhone,
        accessToken,
        webhookStatus: 'pending',
        connectedAt: now,
      },
    },
    {
      kind: 'update',
      path: `organizations/${orgId}`,
      data: {
        whatsapp: {
          connected: true,
          phoneNumberId: input.phoneNumberId,
          wabaId: input.businessAccountId,
          displayPhoneNumber: displayPhone,
          verifiedName,
          qualityRating,
          connectedAt: now,
        },
      },
      // Never includes 'whatsapp.greeting' — that field is merchant-authored and untouched here.
      mask: [
        'whatsapp.connected',
        'whatsapp.phoneNumberId',
        'whatsapp.wabaId',
        'whatsapp.displayPhoneNumber',
        'whatsapp.verifiedName',
        'whatsapp.qualityRating',
        'whatsapp.connectedAt',
      ],
    },
  ];

  await commitTransaction(env, transaction, writes);
  return { displayPhone, qualityRating };
}
