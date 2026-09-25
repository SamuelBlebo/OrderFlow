import type { Env } from './env';
import { setDoc } from './firestore';
import type { InboundMessage } from './types';

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

/**
 * Every message, either direction, logged under the customer it belongs to —
 * this is what the dashboard's Inbox reads. Inbound doc ids are the WhatsApp
 * message id, so Meta's delivery retries overwrite the same log entry
 * instead of duplicating it; outbound ids are generated (a bot reply or
 * markAsRead call has no message id of its own to reuse).
 */
export async function logInboundMessage(env: Env, orgId: string, waId: string, message: InboundMessage): Promise<void> {
  const path = `organizations/${orgId}/customers/${waId}/messages/${message.id}`;
  const body =
    message.text?.body ??
    message.interactive?.list_reply?.title ??
    message.interactive?.button_reply?.title ??
    null;

  await setDoc(env, path, {
    direction: 'in',
    type: message.type,
    body,
    waMessageId: message.id,
    createdAt: new Date(),
  });
}

export async function logOutboundMessage(env: Env, orgId: string, waId: string, type: string, body: string | null): Promise<void> {
  const path = `organizations/${orgId}/customers/${waId}/messages/${generateId()}`;
  await setDoc(env, path, {
    direction: 'out',
    type,
    body,
    waMessageId: null,
    createdAt: new Date(),
  });
}
