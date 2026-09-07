import type { Timestamps } from './common';

/** Created from the inbound WhatsApp number. Customers never sign up. */
export interface Customer extends Timestamps {
  name: string;
  phone: string;
  waId: string;
  address: string | null;
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: string | null;
}
