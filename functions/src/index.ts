/**
 * Cloud Functions entry point.
 *
 * Everything that touches a Meta access token, or that writes customer and
 * order data, lives here — never in the browser. This file only re-exports;
 * the implementations sit in their own modules.
 */
import { onRequest } from 'firebase-functions/v2/https';

// Inbound WhatsApp messages: verification handshake, signature check, bot engine.
export { whatsappWebhook } from './whatsapp/webhook';

// Callable endpoints the dashboard uses for anything rules cannot safely allow.
export {
  createOrganization,
  connectWhatsapp,
  disconnectWhatsapp,
  sendTestMessage,
} from './http/organizations';

// Background work.
export { onOrderStatusChange } from './triggers/onOrderStatusChange';
export { cleanupSessions } from './triggers/cleanupSessions';

export const health = onRequest((_req, res) => {
  res.json({ ok: true, service: 'orderflow-functions' });
});
