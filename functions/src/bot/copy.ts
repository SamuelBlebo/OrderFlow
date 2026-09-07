import type { OrderStatus } from '../types';

export const BUTTONS = {
  browse: 'menu:browse',
  cart: 'menu:cart',
  checkout: 'cart:checkout',
  clear: 'cart:clear',
  addMore: 'cart:more',
  confirm: 'order:confirm',
  cancel: 'order:cancel',
  more: 'catalog:more',
  human: 'menu:human',
} as const;

export const statusUpdate: Record<OrderStatus, (n: number) => string | null> = {
  pending: () => null,
  confirmed: (n) => `Order #${n} is confirmed. We are getting it ready now.`,
  packed: (n) => `Order #${n} is packed and waiting for the rider.`,
  delivering: (n) => `Order #${n} is on its way to you. Please keep your phone close.`,
  completed: (n) => `Order #${n} is delivered. Thank you for shopping with us.`,
  cancelled: (n) => `Order #${n} has been cancelled. Message us if this is a mistake.`,
};

export const HELP =
  'Send "hi" to start over, "items" to see what we sell, or "cart" to check what you have picked.';
