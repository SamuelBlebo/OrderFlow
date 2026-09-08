import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { CATALOG_PAGE_SIZE } from '../config';
import { resolveUsage } from '../billing';
import {
  customersRef,
  loadOrgProfile,
  money,
  orderItemsRef,
  orgRef,
  ordersRef,
  productsRef,
  sessionsRef,
  type OrgProfile,
} from '../tenant';
import { sendButtons, sendImage, sendList, sendText } from '../whatsapp/client';
import type { InboundMessage, OrderItem, OrderStatus, Session, WhatsappCredentials } from '../types';
import { BUTTONS, HELP, STATUS_LABEL } from './copy';

const EMPTY_SESSION: Omit<Session, 'updatedAt'> = {
  step: 'idle',
  cart: [],
  catalogPage: 0,
  pendingProductId: null,
  draftName: null,
  draftAddress: null,
  handledMessageIds: [],
};

interface Ctx {
  orgId: string;
  creds: WhatsappCredentials;
  profile: OrgProfile;
  waId: string;
  profileName: string;
  session: Session;
}

/**
 * Entry point for one inbound customer message. All reads and writes are scoped
 * to `orgId`, which the webhook resolved from the receiving phone number.
 */
export async function handleMessage(
  orgId: string,
  creds: WhatsappCredentials,
  message: InboundMessage,
  profileName: string,
): Promise<void> {
  const waId = message.from;
  const sessionDoc = sessionsRef(orgId).doc(waId);
  const snap = await sessionDoc.get();
  const session: Session = snap.exists
    ? (snap.data() as Session)
    : { ...EMPTY_SESSION, updatedAt: Timestamp.now() };

  // WhatsApp retries deliveries; never double-handle the same message id.
  if (session.handledMessageIds?.includes(message.id)) {
    logger.info('Duplicate inbound message ignored', { orgId, messageId: message.id });
    return;
  }

  const profile = await loadOrgProfile(orgId);

  // A platform admin suspended this merchant (functions/src/http/admin.ts) —
  // stop taking new orders, but still mark the message handled so WhatsApp's
  // retry doesn't resend this notice every few seconds.
  if (profile.suspended) {
    logger.info('Message received for a suspended organization', { orgId, messageId: message.id });
    await sendText(creds, waId, 'This shop is temporarily unavailable. Please check back later.');
    await sessionDoc.set(
      {
        handledMessageIds: [...(session.handledMessageIds ?? []), message.id].slice(-20),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  const ctx: Ctx = { orgId, creds, profile, waId, profileName, session };

  const intent = readIntent(message);
  const next = await route(ctx, intent);

  await sessionDoc.set(
    {
      ...next,
      handledMessageIds: [...(session.handledMessageIds ?? []), message.id].slice(-20),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/* --------------------------------- Intent --------------------------------- */

type Intent =
  | { kind: 'action'; id: string }
  | { kind: 'text'; body: string }
  | { kind: 'unsupported' };

function readIntent(message: InboundMessage): Intent {
  if (message.type === 'interactive') {
    const id =
      message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id ?? null;
    return id ? { kind: 'action', id } : { kind: 'unsupported' };
  }
  if (message.type === 'text' && message.text?.body) {
    return { kind: 'text', body: message.text.body.trim() };
  }
  return { kind: 'unsupported' };
}

const GREETINGS = ['hi', 'hello', 'hey', 'start', 'good morning', 'good afternoon', 'good evening'];

/* -------------------------------- Routing --------------------------------- */

async function route(ctx: Ctx, intent: Intent): Promise<Partial<Session>> {
  if (intent.kind === 'unsupported') {
    await sendText(ctx.creds, ctx.waId, `We can only read text and menu choices here. ${HELP}`);
    return {};
  }

  if (intent.kind === 'action') return handleAction(ctx, intent.id);

  const body = intent.body;
  const lower = body.toLowerCase();

  // Global shortcuts always win, even mid-checkout.
  if (GREETINGS.includes(lower)) return showWelcome(ctx);
  if (['1', 'shop', 'items', 'menu', 'catalogue', 'catalog', 'products'].includes(lower)) {
    return showCatalog(ctx, 0);
  }
  if (['2', 'track order', 'track'].includes(lower)) return showOrderStatus(ctx);
  if (['3', 'contact seller', 'contact', 'seller'].includes(lower)) return connectHuman(ctx);
  if (lower === 'cart') return showCart(ctx);
  if (['cancel', 'stop'].includes(lower)) return resetTo(ctx, 'No problem, we cleared that.');

  switch (ctx.session.step) {
    case 'awaiting_qty':
      return captureQuantity(ctx, body);
    case 'awaiting_name':
      return captureName(ctx, body);
    case 'awaiting_address':
      return captureAddress(ctx, body);
    case 'awaiting_confirm':
      return promptConfirm(ctx, 'Tap Confirm order or Cancel below to finish.');
    default:
      return showWelcome(ctx);
  }
}

async function handleAction(ctx: Ctx, id: string): Promise<Partial<Session>> {
  if (id === BUTTONS.browse) return showCatalog(ctx, 0);
  if (id === BUTTONS.more) return showCatalog(ctx, ctx.session.catalogPage + 1);
  if (id === BUTTONS.cart || id === BUTTONS.addMore) {
    return id === BUTTONS.addMore ? showCatalog(ctx, 0) : showCart(ctx);
  }
  if (id === BUTTONS.clear) return resetTo(ctx, 'Your cart is empty again.');
  if (id === BUTTONS.checkout) return startCheckout(ctx);
  if (id === BUTTONS.confirm) return placeOrder(ctx);
  if (id === BUTTONS.cancel) return resetTo(ctx, 'Order cancelled. Nothing was charged.');
  if (id === BUTTONS.human) return connectHuman(ctx);
  if (id.startsWith('p:')) return showProduct(ctx, id.slice(2));
  if (id.startsWith('add:')) return askQuantity(ctx, id.slice(4));
  return showWelcome(ctx);
}

/* --------------------------------- Screens -------------------------------- */

async function showWelcome(ctx: Ctx): Promise<Partial<Session>> {
  await sendText(ctx.creds, ctx.waId, 'Welcome. Reply:\n1 Shop\n2 Track Order\n3 Contact Seller');
  return { step: 'idle' };
}

/** "2 Track Order" — the customer's most recent order, by their WhatsApp id. */
async function showOrderStatus(ctx: Ctx): Promise<Partial<Session>> {
  const snap = await ordersRef(ctx.orgId)
    .where('customerId', '==', ctx.waId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snap.empty) {
    await sendText(ctx.creds, ctx.waId, 'You have no orders with us yet. Reply 1 to start shopping.');
    return { step: 'idle' };
  }

  const order = snap.docs[0];
  const number = order.get('number') as number;
  const status = order.get('status') as OrderStatus;
  const total = order.get('total') as number;
  const currency = (order.get('currency') as string | undefined) ?? ctx.profile.currency;

  await sendText(
    ctx.creds,
    ctx.waId,
    `Order #${number}\nStatus: ${STATUS_LABEL[status] ?? status}\nTotal: ${money(total, currency)}`,
  );
  return { step: 'idle' };
}

async function showCatalog(ctx: Ctx, page: number): Promise<Partial<Session>> {
  const snap = await productsRef(ctx.orgId)
    .where('active', '==', true)
    .orderBy('name')
    .limit(CATALOG_PAGE_SIZE * (page + 1) + 1)
    .get();

  const all = snap.docs.slice(page * CATALOG_PAGE_SIZE);
  const pageItems = all.slice(0, CATALOG_PAGE_SIZE);
  const hasMore = all.length > CATALOG_PAGE_SIZE;

  if (pageItems.length === 0) {
    await sendText(
      ctx.creds,
      ctx.waId,
      page === 0
        ? 'We are still adding items. Please check back shortly.'
        : 'That is everything we have for now.',
    );
    return { step: 'idle', catalogPage: 0 };
  }

  const rows = pageItems.map((doc) => ({
    id: `p:${doc.id}`,
    title: doc.get('name') as string,
    description: money(doc.get('price') as number, ctx.profile.currency),
  }));
  if (hasMore) rows.push({ id: BUTTONS.more, title: 'See more items', description: 'Next page' });

  await sendList(ctx.creds, ctx.waId, {
    body: 'Here is what we have. Tap an item to see it.',
    buttonLabel: 'Open list',
    sectionTitle: ctx.profile.name,
    rows,
  });
  return { step: 'catalog', catalogPage: page };
}

async function showProduct(ctx: Ctx, productId: string): Promise<Partial<Session>> {
  const doc = await productsRef(ctx.orgId).doc(productId).get();
  if (!doc.exists || doc.get('active') !== true) {
    await sendText(ctx.creds, ctx.waId, 'That item is no longer available.');
    return showCatalog(ctx, 0);
  }

  const name = doc.get('name') as string;
  const price = doc.get('price') as number;
  const description = (doc.get('description') as string) || '';
  const imageUrl = doc.get('imageUrl') as string | undefined;
  const caption = `${name}\n${money(price, ctx.profile.currency)}${description ? `\n\n${description}` : ''}`;

  if (imageUrl) await sendImage(ctx.creds, ctx.waId, imageUrl, caption);

  await sendButtons(ctx.creds, ctx.waId, {
    body: imageUrl ? 'Would you like this one?' : caption,
    buttons: [
      { id: `add:${productId}`, title: 'Add to cart' },
      { id: BUTTONS.browse, title: 'Back to items' },
    ],
  });
  return { step: 'catalog', pendingProductId: productId };
}

async function askQuantity(ctx: Ctx, productId: string): Promise<Partial<Session>> {
  await sendText(ctx.creds, ctx.waId, 'How many would you like? Reply with a number, e.g. 2');
  return { step: 'awaiting_qty', pendingProductId: productId };
}

async function captureQuantity(ctx: Ctx, body: string): Promise<Partial<Session>> {
  const quantity = Number.parseInt(body.replace(/\D/g, ''), 10);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
    await sendText(ctx.creds, ctx.waId, 'Please reply with a number between 1 and 99.');
    return {};
  }
  const productId = ctx.session.pendingProductId;
  if (!productId) return showCatalog(ctx, 0);

  const doc = await productsRef(ctx.orgId).doc(productId).get();
  if (!doc.exists || doc.get('active') !== true) {
    await sendText(ctx.creds, ctx.waId, 'That item just sold out.');
    return showCatalog(ctx, 0);
  }

  const stock = doc.get('stock') as number | null | undefined;
  if (typeof stock === 'number' && quantity > stock) {
    await sendText(ctx.creds, ctx.waId, `We only have ${stock} left. Reply with a smaller number.`);
    return {};
  }

  const cart = mergeIntoCart(ctx.session.cart ?? [], {
    productId,
    name: doc.get('name') as string,
    price: doc.get('price') as number,
    quantity,
  });

  await sendButtons(ctx.creds, ctx.waId, {
    body: `Added. ${cartSummary(cart, ctx.profile.currency)}`,
    buttons: [
      { id: BUTTONS.addMore, title: 'Add more' },
      { id: BUTTONS.checkout, title: 'Checkout' },
    ],
  });
  return { step: 'catalog', cart, pendingProductId: null };
}

async function showCart(ctx: Ctx): Promise<Partial<Session>> {
  const cart = ctx.session.cart ?? [];
  if (cart.length === 0) {
    await sendButtons(ctx.creds, ctx.waId, {
      body: 'Your cart is empty. Have a look at what we sell.',
      buttons: [{ id: BUTTONS.browse, title: 'See items' }],
    });
    return { step: 'idle' };
  }
  await sendButtons(ctx.creds, ctx.waId, {
    body: cartSummary(cart, ctx.profile.currency),
    buttons: [
      { id: BUTTONS.checkout, title: 'Checkout' },
      { id: BUTTONS.addMore, title: 'Add more' },
      { id: BUTTONS.clear, title: 'Empty cart' },
    ],
  });
  return { step: 'catalog' };
}

async function startCheckout(ctx: Ctx): Promise<Partial<Session>> {
  if ((ctx.session.cart ?? []).length === 0) return showCart(ctx);

  const known = await customersRef(ctx.orgId).doc(ctx.waId).get();
  const savedName = known.exists ? (known.get('name') as string) : null;
  const name = savedName ?? ctx.profileName;

  if (name) {
    await sendText(ctx.creds, ctx.waId, `Thanks ${name}. Where should we deliver? Send the address.`);
    return { step: 'awaiting_address', draftName: name };
  }
  await sendText(ctx.creds, ctx.waId, 'What name should we put on the order?');
  return { step: 'awaiting_name' };
}

async function captureName(ctx: Ctx, body: string): Promise<Partial<Session>> {
  const name = body.slice(0, 60);
  if (name.length < 2) {
    await sendText(ctx.creds, ctx.waId, 'Please send the name you want on the order.');
    return {};
  }
  await sendText(ctx.creds, ctx.waId, `Thanks ${name}. Where should we deliver? Send the address.`);
  return { step: 'awaiting_address', draftName: name };
}

async function captureAddress(ctx: Ctx, body: string): Promise<Partial<Session>> {
  const address = body.slice(0, 300);
  if (address.length < 5) {
    await sendText(
      ctx.creds,
      ctx.waId,
      'Please send a fuller address, including a landmark we can find.',
    );
    return {};
  }
  return promptConfirm({ ...ctx, session: { ...ctx.session, draftAddress: address } });
}

async function promptConfirm(ctx: Ctx, prefix?: string): Promise<Partial<Session>> {
  const cart = ctx.session.cart ?? [];
  const subtotal = cartTotal(cart);
  const total = subtotal + ctx.profile.deliveryFee;
  const lines = [
    prefix,
    cartSummary(cart, ctx.profile.currency),
    `Delivery: ${money(ctx.profile.deliveryFee, ctx.profile.currency)}`,
    `Total: ${money(total, ctx.profile.currency)}`,
    `Deliver to: ${ctx.session.draftAddress}`,
  ].filter(Boolean);

  await sendButtons(ctx.creds, ctx.waId, {
    body: lines.join('\n'),
    buttons: [
      { id: BUTTONS.confirm, title: 'Confirm order' },
      { id: BUTTONS.cancel, title: 'Cancel' },
    ],
  });
  return {
    step: 'awaiting_confirm',
    draftAddress: ctx.session.draftAddress,
    draftName: ctx.session.draftName,
  };
}

async function placeOrder(ctx: Ctx): Promise<Partial<Session>> {
  const cart = ctx.session.cart ?? [];
  const address = ctx.session.draftAddress;
  const name = ctx.session.draftName ?? ctx.profileName ?? 'Customer';

  if (cart.length === 0 || !address) {
    await sendText(ctx.creds, ctx.waId, 'That order expired. Send "hi" to start again.');
    return { ...EMPTY_SESSION };
  }

  const subtotal = cartTotal(cart);
  const deliveryFee = ctx.profile.deliveryFee;
  const total = subtotal + deliveryFee;
  const orderDoc = ordersRef(ctx.orgId).doc();
  const customerDoc = customersRef(ctx.orgId).doc(ctx.waId);

  // One transaction gives the order its sequential number, writes the order,
  // and updates the customer record — all inside this tenant.
  const { number, usage } = await orgRef(ctx.orgId).firestore.runTransaction(async (tx) => {
    const org = await tx.get(orgRef(ctx.orgId));
    const nextNumber = ((org.get('orderCounter') as number) ?? 0) + 1;
    const customer = await tx.get(customerDoc);
    const usage = resolveUsage(org);

    tx.update(orgRef(ctx.orgId), {
      orderCounter: nextNumber,
      'subscription.currentPeriodStart': usage.periodKey,
      'subscription.ordersUsedThisPeriod': usage.ordersUsedBefore + 1,
    });
    tx.set(orderDoc, {
      number: nextNumber,
      status: 'pending',
      customerId: ctx.waId,
      customerName: name,
      customerPhone: `+${ctx.waId}`,
      deliveryAddress: address,
      items: cart,
      subtotal,
      deliveryFee,
      total,
      currency: ctx.profile.currency,
      channel: 'whatsapp',
      note: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Normalized copy of the same line items — see orderItemsRef in tenant.ts.
    for (const item of cart) {
      tx.set(orderItemsRef(ctx.orgId, orderDoc.id).doc(), {
        orderId: orderDoc.id,
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(
      customerDoc,
      {
        name,
        phone: `+${ctx.waId}`,
        address,
        orderCount: ((customer.exists ? (customer.get('orderCount') as number) : 0) ?? 0) + 1,
        totalSpent: ((customer.exists ? (customer.get('totalSpent') as number) : 0) ?? 0) + total,
        lastOrderAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        // Note is merchant-authored (see updateCustomerNote); never overwrite it here.
        ...(customer.exists ? {} : { note: null, createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    return { number: nextNumber, usage };
  });

  await sendText(
    ctx.creds,
    ctx.waId,
    [
      `Order #${number} is in.`,
      `Total: ${money(total, ctx.profile.currency)}`,
      `Delivering to: ${address}`,
      '',
      'We will message you here as soon as it is confirmed.',
    ].join('\n'),
  );

  // Deliberately non-blocking: a merchant's own plan limit is never a reason
  // to turn away a paying customer. Usage is tracked either way and surfaced
  // on the merchant's Settings > Plan & usage page — this just logs so an
  // over-limit org is visible in the logs, not silently invisible.
  if (usage.overLimit) {
    logger.warn('Order placed over the plan order limit', {
      orgId: ctx.orgId,
      plan: usage.plan,
      ordersUsed: usage.ordersUsedBefore + 1,
      limit: usage.limit,
    });
  }

  return { ...EMPTY_SESSION };
}

async function connectHuman(ctx: Ctx): Promise<Partial<Session>> {
  await sendText(
    ctx.creds,
    ctx.waId,
    ctx.profile.supportPhone
      ? `Someone from ${ctx.profile.name} will reply here shortly. For anything urgent, call ${ctx.profile.supportPhone}.`
      : `Someone from ${ctx.profile.name} will reply here shortly.`,
  );
  return { step: 'idle' };
}

async function resetTo(ctx: Ctx, message: string): Promise<Partial<Session>> {
  await sendButtons(ctx.creds, ctx.waId, {
    body: `${message}\n\nWhat next?`,
    buttons: [{ id: BUTTONS.browse, title: 'See items' }],
  });
  return { ...EMPTY_SESSION };
}

/* ---------------------------------- Cart ---------------------------------- */

function mergeIntoCart(cart: OrderItem[], item: OrderItem): OrderItem[] {
  const existing = cart.find((entry) => entry.productId === item.productId);
  if (!existing) return [...cart, item];
  return cart.map((entry) =>
    entry.productId === item.productId
      ? { ...entry, quantity: Math.min(99, entry.quantity + item.quantity) }
      : entry,
  );
}

function cartTotal(cart: OrderItem[]): number {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function cartSummary(cart: OrderItem[], currency: string): string {
  const lines = cart.map(
    (item) => `${item.quantity} × ${item.name} — ${money(item.price * item.quantity, currency)}`,
  );
  return [...lines, `Items total: ${money(cartTotal(cart), currency)}`].join('\n');
}
