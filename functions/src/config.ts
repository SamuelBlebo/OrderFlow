import { defineSecret, defineString } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';

/** Keep functions close to the merchants they serve. */
export const REGION = 'europe-west1';

setGlobalOptions({ region: REGION, maxInstances: 20, memory: '256MiB' });

/** Token Meta echoes back during webhook verification. */
export const WHATSAPP_VERIFY_TOKEN = defineSecret('WHATSAPP_VERIFY_TOKEN');

/** Meta app secret, used to verify the X-Hub-Signature-256 header. */
export const META_APP_SECRET = defineSecret('META_APP_SECRET');

export const GRAPH_VERSION = defineString('GRAPH_VERSION', { default: 'v21.0' });

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
export const CATALOG_PAGE_SIZE = 9; // WhatsApp allows 10 list rows; one is kept for "See more".
export const TRIAL_DAYS = 14;
