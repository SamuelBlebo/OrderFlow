import type { Env } from './env';
import { findProductByName, getProduct, listActiveProducts } from './catalog';
import { cartSummary, cartTotal, mergeIntoCart, removeAt, setQuantity } from './cart';
import { ensureCustomer, getCustomerName, recordInboundActivity } from './customers';
import { logInboundMessage } from './messages';
import { placeOrder } from './orders';
import { loadSession, saveSession } from './sessions';
import { loadOrgProfile, money } from './tenant';
import { sendButtons, sendList, sendText } from './whatsapp';
import type { InboundMessage, OrgProfile, Session, WhatsappAccount } from './types';

const ACTIONS = {
  browse: 'menu:browse',
  cart: 'menu:cart',
  addMore: 'cart:more',
  checkout: 'cart:checkout',
  clear: 'cart:clear',
  confirm: 'order:confirm',
  cancel: 'order:cancel',
} as const;

const GREETINGS = ['hi', 'hello', 'hey', 'start', 'good morning', 'good afternoon', 'good evening'];
const REMOVE_PATTERN = /^remove\s+(\d+)$/;
const QTY_PATTERN = /^qty\s+(\d+)\s+(\d+)$/;

interface Ctx {
  env: Env;
  orgId: string;
  account: WhatsappAccount;
  waId: string;
  profileName: string;
  session: Session;
  profile: OrgProfile;
}

/**
 * Sprint 1 gave every merchant a live catalog reply. Sprint 2 added a real
 * shopping flow on top of it: a persistent per-customer cart
 * (`organizations/{orgId}/sessions/{waId}`), adding by tapping a list row OR
 * just typing a number/name, quantity edits, item removal, and a checkout
 * command that collects delivery details. Sprint 3 (confirmCheckout below)
 * turns a confirmed checkout into a real order via orders.ts — order
 * number, inventory reservation and Pending status, inside one transaction.
 */
export async function handleInboundMessage(
  env: Env,
  account: WhatsappAccount,
  message: InboundMessage,
  profileName: string,
): Promise<void> {
  const orgId = account.organizationId;
  const waId = message.from;

  const [session] = await Promise.all([
    loadSession(env, orgId, waId),
    ensureCustomer(env, orgId, waId, profileName),
    logInboundMessage(env, orgId, waId, message),
  ]);

  // WhatsApp retries deliveries; never double-handle the same message id.
  // (ensureCustomer/logInboundMessage above are naturally idempotent —
  // doc-id-keyed overwrites — but a counter bump is not, so it waits until
  // here, past the dedup check.)
  if (session.handledMessageIds.includes(message.id)) return;
  await recordInboundActivity(env, orgId, waId);

  const profile = await loadOrgProfile(env, orgId);
  const ctx: Ctx = { env, orgId, account, waId, profileName, session, profile };

  if (profile.suspended) {
    await sendText(env, account, waId, 'This shop is temporarily unavailable. Please check back later.');
    await saveSession(env, orgId, waId, session, message.id);
    return;
  }

  const patch = await route(ctx, readIntent(message));
  await saveSession(env, orgId, waId, { ...session, ...patch }, message.id);
}

/* --------------------------------- Intent --------------------------------- */

type Intent = { kind: 'action'; id: string } | { kind: 'text'; body: string } | { kind: 'unsupported' };

function readIntent(message: InboundMessage): Intent {
  if (message.type === 'interactive') {
    const id = message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id ?? null;
    return id ? { kind: 'action', id } : { kind: 'unsupported' };
  }
  if (message.type === 'text' && message.text?.body) {
    return { kind: 'text', body: message.text.body.trim() };
  }
  return { kind: 'unsupported' };
}

/* -------------------------------- Routing --------------------------------- */

async function route(ctx: Ctx, intent: Intent): Promise<Partial<Session>> {
  if (intent.kind === 'unsupported') {
    await sendText(ctx.env, ctx.account, ctx.waId, 'We can only read text and menu choices here. Send "hi" to see the menu.');
    return {};
  }
  if (intent.kind === 'action') return handleAction(ctx, intent.id);

  const body = intent.body;
  const lower = body.toLowerCase();

  // Global shortcuts always win, even mid-checkout.
  if (GREETINGS.includes(lower)) return showCatalog(ctx, `Welcome to ${ctx.profile.name}.`);
  if (['menu', 'shop', 'catalog', 'catalogue', 'products', 'items'].includes(lower)) return showCatalog(ctx);
  if (lower === 'cart') return showCart(ctx);
  if (lower === 'checkout') return startCheckout(ctx);
  if (['cancel', 'stop'].includes(lower)) return resetCart(ctx, 'No problem, we cleared your cart.');

  const removeMatch = lower.match(REMOVE_PATTERN);
  if (removeMatch) return removeItem(ctx, Number(removeMatch[1]));

  const qtyMatch = lower.match(QTY_PATTERN);
  if (qtyMatch) return updateQuantity(ctx, Number(qtyMatch[1]), Number(qtyMatch[2]));

  switch (ctx.session.step) {
    case 'awaiting_qty':
      return captureQuantity(ctx, body);
    case 'awaiting_name':
      return captureName(ctx, body);
    case 'awaiting_address':
      return captureAddress(ctx, body);
    case 'awaiting_confirm':
      return promptConfirm(ctx, 'Reply "confirm" to place this order, or "cancel" to stop.');
    case 'catalog':
      return selectProduct(ctx, body);
    default:
      return showCatalog(ctx, `Welcome to ${ctx.profile.name}.`);
  }
}

async function handleAction(ctx: Ctx, id: string): Promise<Partial<Session>> {
  if (id === ACTIONS.browse || id === ACTIONS.addMore) return showCatalog(ctx);
  if (id === ACTIONS.cart) return showCart(ctx);
  if (id === ACTIONS.clear) return resetCart(ctx, 'Your cart is empty again.');
  if (id === ACTIONS.checkout) return startCheckout(ctx);
  if (id === ACTIONS.confirm) return confirmCheckout(ctx);
  if (id === ACTIONS.cancel) return resetCart(ctx, 'Order cancelled. Nothing was charged.');
  if (id.startsWith('p:')) return askQuantityFor(ctx, id.slice(2));
  return showCatalog(ctx);
}

/* --------------------------------- Screens -------------------------------- */

async function showCatalog(ctx: Ctx, prefix?: string): Promise<Partial<Session>> {
  const products = await listActiveProducts(ctx.env, ctx.orgId);

  if (products.length === 0) {
    await sendText(
      ctx.env,
      ctx.account,
      ctx.waId,
      [prefix, 'We are still adding items. Please check back shortly.'].filter(Boolean).join(' '),
    );
    return { step: 'idle', catalogProductIds: [] };
  }

  await sendList(ctx.env, ctx.account, ctx.waId, {
    body: [prefix, 'Here is what we have. Tap an item, or just type its number or name.'].filter(Boolean).join(' '),
    buttonLabel: 'Open list',
    sectionTitle: ctx.profile.name,
    rows: products.map((product, index) => ({
      id: `p:${product.id}`,
      title: `${index + 1}. ${product.name}`,
      description: money(product.price, ctx.profile.currency),
    })),
  });
  return { step: 'catalog', catalogProductIds: products.map((product) => product.id) };
}

/** Free-text while browsing: a bare number (position in the last list shown) or a product name. */
async function selectProduct(ctx: Ctx, body: string): Promise<Partial<Session>> {
  const asPosition = Number.parseInt(body, 10);
  let productId: string | null = null;

  if (Number.isInteger(asPosition) && String(asPosition) === body.trim() && asPosition >= 1 && asPosition <= ctx.session.catalogProductIds.length) {
    productId = ctx.session.catalogProductIds[asPosition - 1];
  } else {
    const match = await findProductByName(ctx.env, ctx.orgId, body);
    productId = match?.id ?? null;
  }

  if (!productId) {
    await sendText(
      ctx.env,
      ctx.account,
      ctx.waId,
      'Sorry, we could not match that. Reply with the item number or its name, or "menu" to see the list again.',
    );
    return {};
  }
  return askQuantityFor(ctx, productId);
}

async function askQuantityFor(ctx: Ctx, productId: string): Promise<Partial<Session>> {
  const product = await getProduct(ctx.env, ctx.orgId, productId);
  if (!product || !product.active) {
    await sendText(ctx.env, ctx.account, ctx.waId, 'That item is no longer available.');
    return showCatalog(ctx);
  }
  await sendText(
    ctx.env,
    ctx.account,
    ctx.waId,
    `${product.name} — ${money(product.price, ctx.profile.currency)}\nHow many would you like? Reply with a number, e.g. 2`,
  );
  return { step: 'awaiting_qty', pendingProductId: productId };
}

async function captureQuantity(ctx: Ctx, body: string): Promise<Partial<Session>> {
  const quantity = Number.parseInt(body.replace(/\D/g, ''), 10);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
    await sendText(ctx.env, ctx.account, ctx.waId, 'Please reply with a number between 1 and 99.');
    return {};
  }

  const productId = ctx.session.pendingProductId;
  if (!productId) return showCatalog(ctx);

  const product = await getProduct(ctx.env, ctx.orgId, productId);
  if (!product || !product.active) {
    await sendText(ctx.env, ctx.account, ctx.waId, 'That item just sold out.');
    return showCatalog(ctx);
  }
  if (typeof product.stock === 'number' && quantity > product.stock) {
    await sendText(ctx.env, ctx.account, ctx.waId, `We only have ${product.stock} left. Reply with a smaller number.`);
    return {};
  }

  const cart = mergeIntoCart(ctx.session.cart, {
    productId,
    name: product.name,
    price: product.price,
    quantity,
  });

  await sendButtons(ctx.env, ctx.account, ctx.waId, {
    body: `Added. ${cartSummary(cart, ctx.profile.currency)}`,
    buttons: [
      { id: ACTIONS.addMore, title: 'Add more' },
      { id: ACTIONS.checkout, title: 'Checkout' },
    ],
  });
  return { step: 'catalog', cart, pendingProductId: null };
}

async function showCart(ctx: Ctx): Promise<Partial<Session>> {
  const cart = ctx.session.cart;
  if (cart.length === 0) {
    await sendButtons(ctx.env, ctx.account, ctx.waId, {
      body: 'Your cart is empty. Have a look at what we sell.',
      buttons: [{ id: ACTIONS.browse, title: 'See items' }],
    });
    return { step: 'idle' };
  }

  await sendButtons(ctx.env, ctx.account, ctx.waId, {
    body: [
      cartSummary(cart, ctx.profile.currency),
      '',
      'Reply "remove 2" or "qty 2 3" to edit an item by its number.',
    ].join('\n'),
    buttons: [
      { id: ACTIONS.checkout, title: 'Checkout' },
      { id: ACTIONS.addMore, title: 'Add more' },
      { id: ACTIONS.clear, title: 'Empty cart' },
    ],
  });
  return { step: 'catalog' };
}

async function removeItem(ctx: Ctx, position: number): Promise<Partial<Session>> {
  const index = position - 1;
  if (index < 0 || index >= ctx.session.cart.length) {
    await sendText(ctx.env, ctx.account, ctx.waId, invalidItemHint(ctx));
    return {};
  }
  const cart = removeAt(ctx.session.cart, index);
  await sendText(
    ctx.env,
    ctx.account,
    ctx.waId,
    cart.length ? `Removed. ${cartSummary(cart, ctx.profile.currency)}` : 'Removed. Your cart is now empty.',
  );
  return { cart };
}

async function updateQuantity(ctx: Ctx, position: number, quantity: number): Promise<Partial<Session>> {
  const index = position - 1;
  if (index < 0 || index >= ctx.session.cart.length) {
    await sendText(ctx.env, ctx.account, ctx.waId, invalidItemHint(ctx));
    return {};
  }
  if (quantity < 1 || quantity > 99) {
    await sendText(ctx.env, ctx.account, ctx.waId, 'Quantity must be between 1 and 99.');
    return {};
  }

  const item = ctx.session.cart[index];
  const product = await getProduct(ctx.env, ctx.orgId, item.productId);
  if (product && typeof product.stock === 'number' && quantity > product.stock) {
    await sendText(ctx.env, ctx.account, ctx.waId, `We only have ${product.stock} left.`);
    return {};
  }

  const cart = setQuantity(ctx.session.cart, index, quantity);
  await sendText(ctx.env, ctx.account, ctx.waId, `Updated. ${cartSummary(cart, ctx.profile.currency)}`);
  return { cart };
}

function invalidItemHint(ctx: Ctx): string {
  return ctx.session.cart.length ? 'That is not a valid item number. Reply "cart" to see item numbers.' : 'Your cart is empty.';
}

async function resetCart(ctx: Ctx, message: string): Promise<Partial<Session>> {
  await sendButtons(ctx.env, ctx.account, ctx.waId, {
    body: `${message}\n\nWhat next?`,
    buttons: [{ id: ACTIONS.browse, title: 'See items' }],
  });
  return { step: 'idle', cart: [], pendingProductId: null, draftName: null, draftAddress: null };
}

/* -------------------------------- Checkout -------------------------------- */

async function startCheckout(ctx: Ctx): Promise<Partial<Session>> {
  if (ctx.session.cart.length === 0) return showCart(ctx);

  const savedName = await getCustomerName(ctx.env, ctx.orgId, ctx.waId);
  const name = savedName ?? ctx.profileName;

  if (name) {
    await sendText(ctx.env, ctx.account, ctx.waId, `Thanks ${name}. Where should we deliver? Send the address.`);
    return { step: 'awaiting_address', draftName: name };
  }
  await sendText(ctx.env, ctx.account, ctx.waId, 'What name should we put on the order?');
  return { step: 'awaiting_name' };
}

async function captureName(ctx: Ctx, body: string): Promise<Partial<Session>> {
  const name = body.slice(0, 60);
  if (name.length < 2) {
    await sendText(ctx.env, ctx.account, ctx.waId, 'Please send the name you want on the order.');
    return {};
  }
  await sendText(ctx.env, ctx.account, ctx.waId, `Thanks ${name}. Where should we deliver? Send the address.`);
  return { step: 'awaiting_address', draftName: name };
}

async function captureAddress(ctx: Ctx, body: string): Promise<Partial<Session>> {
  const address = body.slice(0, 300);
  if (address.length < 5) {
    await sendText(ctx.env, ctx.account, ctx.waId, 'Please send a fuller address, including a landmark we can find.');
    return {};
  }
  return promptConfirm({ ...ctx, session: { ...ctx.session, draftAddress: address } });
}

async function promptConfirm(ctx: Ctx, prefix?: string): Promise<Partial<Session>> {
  const cart = ctx.session.cart;
  const total = cartTotal(cart) + ctx.profile.deliveryFee;
  const lines = [
    prefix,
    cartSummary(cart, ctx.profile.currency),
    `Delivery: ${money(ctx.profile.deliveryFee, ctx.profile.currency)}`,
    `Total: ${money(total, ctx.profile.currency)}`,
    `Deliver to: ${ctx.session.draftAddress}`,
  ].filter(Boolean);

  await sendButtons(ctx.env, ctx.account, ctx.waId, {
    body: lines.join('\n'),
    buttons: [
      { id: ACTIONS.confirm, title: 'Confirm order' },
      { id: ACTIONS.cancel, title: 'Cancel' },
    ],
  });
  return { step: 'awaiting_confirm', draftAddress: ctx.session.draftAddress, draftName: ctx.session.draftName };
}

/**
 * Turns a confirmed checkout into a real order — a Firestore transaction
 * (see orders.ts) so the order number, inventory reservation and customer
 * stats either all land or none do.
 */
async function confirmCheckout(ctx: Ctx): Promise<Partial<Session>> {
  if (ctx.session.cart.length === 0 || !ctx.session.draftAddress) {
    await sendText(ctx.env, ctx.account, ctx.waId, 'That order expired. Send "hi" to start again.');
    return { step: 'idle', cart: [], pendingProductId: null, draftName: null, draftAddress: null };
  }

  const result = await placeOrder(ctx.env, {
    orgId: ctx.orgId,
    waId: ctx.waId,
    customerName: ctx.session.draftName ?? ctx.profileName ?? 'Customer',
    address: ctx.session.draftAddress,
    cart: ctx.session.cart,
    deliveryFee: ctx.profile.deliveryFee,
    currency: ctx.profile.currency,
  });

  if (!result.ok) {
    // Stock changed between adding to cart and confirming (someone else
    // bought it, or the merchant adjusted it) — stay in the confirm step so
    // "confirm" after fixing the quantity just re-runs this, not the whole
    // checkout flow over again.
    await sendText(
      ctx.env,
      ctx.account,
      ctx.waId,
      `Sorry, ${result.productName} only has ${result.available} left now. Reply "qty" with the item number and a smaller amount, then try again.`,
    );
    return { step: 'awaiting_confirm' };
  }

  await sendText(
    ctx.env,
    ctx.account,
    ctx.waId,
    [
      `Order #${result.orderNumber} is in.`,
      `Total: ${money(result.total, ctx.profile.currency)}`,
      `Delivering to: ${ctx.session.draftAddress}`,
      '',
      'We will message you here as soon as it is confirmed.',
    ].join('\n'),
  );
  return { step: 'idle', cart: [], pendingProductId: null, draftName: null, draftAddress: null };
}
