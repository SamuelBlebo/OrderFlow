import type { Env } from './env';
import { batchGet, beginTransaction, commitTransaction, type TransactionWrite } from './firestore';
import type { OrderItem } from './types';

/** Mirrors ORDER_LIMITS in functions/src/billing.ts and PLAN_ORDER's limits in web/src/config/plans.ts — keep all three in sync. */
const ORDER_LIMITS: Record<string, number | null> = { free: 15, starter: 75, growth: 300, pro: null };

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A Firestore-style random doc id — the REST API has no client-side auto-id helper like the SDKs do. */
function generateId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

function currentPeriodKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface PlaceOrderInput {
  orgId: string;
  waId: string;
  customerName: string;
  address: string;
  cart: OrderItem[];
  deliveryFee: number;
  currency: string;
}

export type PlaceOrderResult =
  | { ok: true; orderNumber: number; total: number }
  | { ok: false; reason: 'out_of_stock'; productName: string; available: number };

/**
 * Turns a confirmed checkout into a real order — the Worker's equivalent of
 * placeOrder in the old functions/src/bot/engine.ts. Everything happens in
 * one Firestore transaction (begin -> batchGet -> commit over REST, since
 * firebase-admin's runTransaction isn't available outside Node) so the
 * order number, inventory reservation and customer stats either all land or
 * none do — including re-checking stock against what the transaction
 * actually sees, not the numbers the conversation collected earlier, so two
 * customers racing for the last item can't both win.
 */
export async function placeOrder(env: Env, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { orgId, waId, customerName, address, cart, deliveryFee, currency } = input;
  const orgPath = `organizations/${orgId}`;
  const customerPath = `${orgPath}/customers/${waId}`;
  const productPath = (productId: string) => `${orgPath}/products/${productId}`;

  const transaction = await beginTransaction(env);
  const reads = await batchGet(env, [orgPath, customerPath, ...cart.map((item) => productPath(item.productId))], transaction);

  for (const item of cart) {
    const product = reads[productPath(item.productId)];
    const stock = product?.stock as number | null | undefined;
    if (typeof stock === 'number' && item.quantity > stock) {
      return { ok: false, reason: 'out_of_stock', productName: item.name, available: stock };
    }
  }

  const org = reads[orgPath] ?? {};
  const subscription = (org.subscription as Record<string, unknown>) ?? {};
  const plan = (subscription.plan as string) ?? 'free';
  const periodKey = currentPeriodKey(new Date());
  const storedPeriod = subscription.currentPeriodStart as string | undefined;
  const ordersUsedBefore = storedPeriod === periodKey ? ((subscription.ordersUsedThisPeriod as number) ?? 0) : 0;
  const ordersUsedAfter = ordersUsedBefore + 1;
  const limit = ORDER_LIMITS[plan] ?? null;
  if (limit !== null && ordersUsedBefore >= limit) {
    // A merchant's own plan limit is never a reason to turn away a paying
    // customer — usage is tracked either way and surfaced on their Settings
    // > Plan & usage page. Just make an over-limit order visible in logs.
    console.warn('Order placed over the plan order limit', { orgId, plan, ordersUsed: ordersUsedAfter, limit });
  }

  const orderNumber = ((org.orderCounter as number) ?? 0) + 1;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + deliveryFee;
  const orderId = generateId();
  const now = new Date();

  const writes: TransactionWrite[] = [
    {
      kind: 'update',
      path: orgPath,
      data: { orderCounter: orderNumber, subscription: { currentPeriodStart: periodKey, ordersUsedThisPeriod: ordersUsedAfter } },
      mask: ['orderCounter', 'subscription.currentPeriodStart', 'subscription.ordersUsedThisPeriod'],
    },
    {
      kind: 'set',
      path: `${orgPath}/orders/${orderId}`,
      data: {
        number: orderNumber,
        status: 'pending',
        customerId: waId,
        customerName,
        customerPhone: `+${waId}`,
        deliveryAddress: address,
        items: cart,
        subtotal,
        deliveryFee,
        total,
        currency,
        channel: 'whatsapp',
        note: null,
        riderName: null,
        riderPhone: null,
        estimatedDeliveryAt: null,
        // Seeds the delivery timeline (OrderDetailModal on the dashboard) —
        // every later status change appends to this via arrayUnion, see
        // updateOrder in web/src/services/order.service.ts.
        statusHistory: [{ status: 'pending', changedAt: now }],
        createdAt: now,
        updatedAt: now,
      },
    },
  ];

  for (const item of cart) {
    // Normalized copy of the same line item — same origin, same access
    // pattern as orderItemsRef in functions/src/tenant.ts.
    writes.push({
      kind: 'set',
      path: `${orgPath}/orders/${orderId}/orderItems/${generateId()}`,
      data: {
        orderId,
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
        createdAt: now,
      },
    });

    const stock = reads[productPath(item.productId)]?.stock as number | null | undefined;
    if (typeof stock === 'number') {
      writes.push({ kind: 'update', path: productPath(item.productId), data: { stock: stock - item.quantity }, mask: ['stock'] });
    }
  }

  const customer = reads[customerPath];
  writes.push({
    kind: 'update',
    path: customerPath,
    data: {
      name: customerName,
      phone: `+${waId}`,
      address,
      orderCount: ((customer?.orderCount as number) ?? 0) + 1,
      totalSpent: ((customer?.totalSpent as number) ?? 0) + total,
      lastOrderAt: now,
      updatedAt: now,
    },
    mask: ['name', 'phone', 'address', 'orderCount', 'totalSpent', 'lastOrderAt', 'updatedAt'],
  });

  await commitTransaction(env, transaction, writes);
  return { ok: true, orderNumber, total };
}
