/**
 * Cloud Functions entry point.
 *
 * Everything that touches a Meta access token, or that writes customer and
 * order data, lives here — never in the browser. This file only re-exports;
 * the implementations sit in their own modules.
 *
 * The inbound WhatsApp webhook (verification handshake, signature check, bot
 * engine) is NOT here — it moved to a Cloudflare Worker (see worker/), which
 * is now the only thing that answers Meta's traffic. What stays here is
 * everything Firestore-trigger-based (no Worker equivalent) or
 * dashboard-facing: connecting/disconnecting a number, sending a broadcast
 * or test message, and reacting to an order's status changing.
 */
import { onRequest } from 'firebase-functions/v2/https';

// Callable endpoints the dashboard uses for anything rules cannot safely allow.
export {
  createOrganization,
  connectWhatsapp,
  disconnectWhatsapp,
  sendTestMessage,
  exchangeEmbeddedSignupCode,
} from './http/organizations';
export { sendBroadcast, sendReply } from './http/customers';
export { changePlan, billingWebhook } from './http/billing';
export {
  getPlatformMetrics,
  listMerchants,
  suspendMerchant,
  unsuspendMerchant,
  deleteMerchant,
} from './http/admin';

// Background work.
export { onOrderStatusChange } from './triggers/onOrderStatusChange';
export { cleanupSessions } from './triggers/cleanupSessions';
export { renewSubscriptions } from './triggers/renewSubscriptions';

export const health = onRequest((_req, res) => {
  res.json({ ok: true, service: 'orderflow-functions' });
});
