import { money } from './tenant';
import type { OrderItem } from './types';

export function mergeIntoCart(cart: OrderItem[], item: OrderItem): OrderItem[] {
  const existing = cart.find((entry) => entry.productId === item.productId);
  if (!existing) return [...cart, item];
  return cart.map((entry) =>
    entry.productId === item.productId
      ? { ...entry, quantity: Math.min(99, entry.quantity + item.quantity) }
      : entry,
  );
}

/** `index` is 0-based; callers translate the customer-facing 1-based item number. */
export function setQuantity(cart: OrderItem[], index: number, quantity: number): OrderItem[] {
  return cart.map((entry, i) => (i === index ? { ...entry, quantity } : entry));
}

export function removeAt(cart: OrderItem[], index: number): OrderItem[] {
  return cart.filter((_, i) => i !== index);
}

export function cartTotal(cart: OrderItem[]): number {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/** Numbered so "remove 2" / "qty 2 3" refer to the same lines this prints. */
export function cartSummary(cart: OrderItem[], currency: string): string {
  const lines = cart.map(
    (item, i) => `${i + 1}. ${item.quantity} × ${item.name} — ${money(item.price * item.quantity, currency)}`,
  );
  return [...lines, `Items total: ${money(cartTotal(cart), currency)}`].join('\n');
}
