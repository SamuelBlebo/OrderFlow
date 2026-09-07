import type { Timestamps } from './common';

export type BusinessCategory =
  | 'fashion'
  | 'beauty'
  | 'food'
  | 'pharmacy'
  | 'electronics'
  | 'books'
  | 'other';

export type PlanId = 'starter' | 'growth' | 'pro';

export interface Subscription {
  plan: PlanId;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  orderQuotaPerMonth: number | null;
  renewsAt: string | null;
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
  category: BusinessCategory;
  currency: 'GHS' | 'NGN' | 'KES' | 'USD';
  deliveryFee: number;
  ownerUid: string;
  memberUids: string[];
  subscription: Subscription;
  whatsapp: WhatsAppAccount;
}
