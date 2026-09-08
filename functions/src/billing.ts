export type PlanId = 'free' | 'starter' | 'growth' | 'pro';

/** Mirrors the orderLimit values in web/src/config/plans.ts — keep both in sync. */
export const ORDER_LIMITS: Record<PlanId, number | null> = {
  free: 20,
  starter: 150,
  growth: 600,
  pro: null,
};

function currentPeriodKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export interface UsageState {
  plan: PlanId;
  /** "YYYY-MM" to store back onto the org so next month's first order resets the counter. */
  periodKey: string;
  /** Orders placed so far this period, before the order being counted right now. */
  ordersUsedBefore: number;
  limit: number | null;
  overLimit: boolean;
}

/**
 * Reads usage off an org snapshot already fetched inside a transaction and
 * rolls the counter over if the stored period has passed — no scheduled
 * function needed, since the next order placed after month-end naturally
 * starts a fresh count.
 */
export function resolveUsage(org: FirebaseFirestore.DocumentSnapshot, now = new Date()): UsageState {
  const plan = (org.get('subscription.plan') as PlanId) ?? 'free';
  const periodKey = currentPeriodKey(now);
  const storedPeriod = org.get('subscription.currentPeriodStart') as string | undefined;
  const ordersUsedBefore = storedPeriod === periodKey ? ((org.get('subscription.ordersUsedThisPeriod') as number) ?? 0) : 0;
  const limit = ORDER_LIMITS[plan];
  return { plan, periodKey, ordersUsedBefore, limit, overLimit: limit !== null && ordersUsedBefore >= limit };
}
