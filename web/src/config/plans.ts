import type { PlanId } from '@/types';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** USD, since this is what the platform charges the merchant — independent of the currency they sell to their own customers in. */
  priceUsd: number;
  orderLimit: number | null;
  productLimit: number | null;
  features: string[];
}

export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'growth', 'pro'];

/**
 * The single source of truth for what each plan includes. Limits live only
 * here, never copied onto an org document — see Subscription in
 * types/organization.ts. Order limits are mirrored in
 * functions/src/billing.ts for server-side enforcement; keep both in sync.
 */
export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    orderLimit: 20,
    productLimit: 10,
    features: ['20 orders / month', '10 products', 'WhatsApp ordering', 'Community support'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceUsd: 15,
    orderLimit: 150,
    productLimit: 50,
    features: ['150 orders / month', '50 products', 'Delivery tracking', 'Email support'],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceUsd: 39,
    orderLimit: 600,
    productLimit: 200,
    features: ['600 orders / month', '200 products', 'Broadcast promotions', 'Priority support'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: 89,
    orderLimit: null,
    productLimit: null,
    features: ['Unlimited orders', 'Unlimited products', 'Broadcast promotions', 'Priority support'],
  },
};
