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

export const SESSION_TTL_MINUTES = 60;
export const CATALOG_PAGE_SIZE = 9; // WhatsApp allows 10 list rows; one is kept for "See more".
export const TRIAL_DAYS = 14;
