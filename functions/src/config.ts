import { defineSecret, defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';

/** Keep functions close to the merchants they serve. */
export const REGION = 'europe-west1';

setGlobalOptions({ region: REGION, maxInstances: 20, memory: '256MiB' });

/**
 * WHATSAPP_VERIFY_TOKEN used to live here too — the inbound webhook that
 * needed it now runs on a Cloudflare Worker (see worker/), set via
 * `wrangler secret put`, not Firebase Secret Manager. META_APP_SECRET is
 * back for a different reason: exchangeEmbeddedSignupCode needs it to
 * complete Meta's OAuth code exchange (http/organizations.ts) — set it with
 * `firebase functions:secrets:set META_APP_SECRET` again if you'd cleared it.
 */
export const GRAPH_VERSION = defineString('GRAPH_VERSION', { default: 'v21.0' });
export const META_APP_SECRET = defineSecret('META_APP_SECRET');
/** Not secret — the same id the client-side Embedded Signup SDK uses (VITE_META_APP_ID in web/.env), needed here as the OAuth exchange's client_id. */
export const META_APP_ID = defineString('META_APP_ID', { default: '' });

/**
 * Stripe/Paystack prep — names settled so a real integration can bind them
 * to changePlan/billingWebhook's `secrets` option later (see
 * http/billing.ts). Deliberately NOT bound to any function yet: Cloud
 * Functions v2 fails to deploy a function whose bound secret doesn't exist
 * in Secret Manager, and none of these do until real keys are provisioned.
 */
export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
export const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
export const PAYSTACK_SECRET_KEY = defineSecret('PAYSTACK_SECRET_KEY');

export const SESSION_TTL_MINUTES = 60;
export const TRIAL_DAYS = 14;
