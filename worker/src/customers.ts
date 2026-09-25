import type { Env } from './env';
import { getDoc, setDoc } from './firestore';

/**
 * Creates `organizations/{orgId}/customers/{waId}` the first time this phone
 * number messages the business — same doc-id-by-WhatsApp-id convention as
 * placeOrder in functions/src/bot/engine.ts, so CustomersPage and the rest
 * of the dashboard see exactly the same record whether it was created by
 * this Worker or a real order. Never touches an existing customer: name,
 * address and note are merchant/order-authored and must not be clobbered by
 * a later message.
 */
export async function ensureCustomer(env: Env, orgId: string, waId: string, profileName: string): Promise<void> {
  const path = `organizations/${orgId}/customers/${waId}`;
  const existing = await getDoc(env, path);
  if (existing) return;

  await setDoc(env, path, {
    name: profileName || null,
    phone: `+${waId}`,
    address: null,
    note: null,
    orderCount: 0,
    totalSpent: 0,
    lastOrderAt: null,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/** A returning customer's saved name, so checkout can skip asking for it again. */
export async function getCustomerName(env: Env, orgId: string, waId: string): Promise<string | null> {
  const data = await getDoc(env, `organizations/${orgId}/customers/${waId}`);
  return (data?.name as string | undefined) ?? null;
}

/**
 * Every inbound message bumps unreadCount — cleared only when a merchant
 * actually looks: opening the conversation in the Inbox, or sending a manual
 * reply (see sendReply, functions/src/http/customers.ts). A bot auto-reply
 * does NOT clear it; nobody merchant-side has read anything yet.
 */
export async function recordInboundActivity(env: Env, orgId: string, waId: string): Promise<void> {
  const path = `organizations/${orgId}/customers/${waId}`;
  const existing = await getDoc(env, path);
  const unreadCount = ((existing?.unreadCount as number | undefined) ?? 0) + 1;
  await setDoc(env, path, { unreadCount, lastMessageAt: new Date() }, { merge: ['unreadCount', 'lastMessageAt'] });
}

/** Bot replies count as activity for sort order, but never as "read". */
export async function touchLastMessageAt(env: Env, orgId: string, waId: string): Promise<void> {
  await setDoc(env, `organizations/${orgId}/customers/${waId}`, { lastMessageAt: new Date() }, { merge: ['lastMessageAt'] });
}
