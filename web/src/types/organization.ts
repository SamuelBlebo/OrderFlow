import type { Timestamps } from './common';

export type BusinessCategory =
  | 'fashion'
  | 'beauty'
  | 'food'
  | 'pharmacy'
  | 'electronics'
  | 'books'
  | 'other';

export type PlanId = 'free' | 'starter' | 'growth' | 'pro';

/** Set once a real subscription exists — see changePlan in functions/src/http/billing.ts. */
export type PaymentProvider = 'stripe' | 'paystack';

export interface Subscription {
  plan: PlanId;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  renewsAt: string | null;
  /**
   * "YYYY-MM" — the month `ordersUsedThisPeriod` is counting. A plan's order
   * limit lives in web/src/config/plans.ts, not here, so raising a limit
   * never requires touching every org document.
   */
  currentPeriodStart: string | null;
  ordersUsedThisPeriod: number;
  paymentProvider: PaymentProvider | null;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
}

export interface WhatsAppAccount {
  connected: boolean;
  displayPhoneNumber: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  verifiedName: string | null;
  greeting: string;
  connectedAt: string | null;
}

export interface Organization extends Timestamps {
  name: string;
  slug: string;
  phone: string | null;
  category: BusinessCategory;
  currency: 'GHS' | 'NGN' | 'KES' | 'USD';
  deliveryFee: number;
  ownerUid: string;
  memberUids: string[];
  subscription: Subscription;
  whatsapp: WhatsAppAccount;
}
