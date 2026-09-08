import { httpsCallable } from 'firebase/functions';
import { limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, featureFlagRef, featureFlagsRef, functions, platformLogsRef } from '@/firebase';
import type { MerchantSummary, PlatformMetrics } from '@/types';

// ---- cross-tenant reads/writes: always through a callable, never a direct
// Firestore rule, so a rules mistake can never leak merchant tenant data. ----

const getPlatformMetricsCallable = httpsCallable<void, PlatformMetrics>(functions, 'getPlatformMetrics');
export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const result = await getPlatformMetricsCallable();
  return result.data;
}

interface ListMerchantsResult {
  merchants: MerchantSummary[];
  nextCursor: string | null;
}
const listMerchantsCallable = httpsCallable<{ cursor?: string; pageSize?: number }, ListMerchantsResult>(
  functions,
  'listMerchants',
);
export async function listMerchants(cursor?: string, pageSize = 25): Promise<ListMerchantsResult> {
  const result = await listMerchantsCallable({ cursor, pageSize });
  return result.data;
}

const suspendMerchantCallable = httpsCallable<{ orgId: string; reason?: string }, { ok: true }>(
  functions,
  'suspendMerchant',
);
export async function suspendMerchant(orgId: string, reason?: string) {
  await suspendMerchantCallable({ orgId, reason });
}

const unsuspendMerchantCallable = httpsCallable<{ orgId: string }, { ok: true }>(functions, 'unsuspendMerchant');
export async function unsuspendMerchant(orgId: string) {
  await unsuspendMerchantCallable({ orgId });
}

const deleteMerchantCallable = httpsCallable<{ orgId: string; confirmName: string }, { ok: true }>(
  functions,
  'deleteMerchant',
);
export async function deleteMerchant(orgId: string, confirmName: string) {
  await deleteMerchantCallable({ orgId, confirmName });
}

// ---- platform-only config/audit data: no merchant tenant data lives here,
// so a direct rule-gated Firestore read/write is fine (see firestore.rules). ----

export const platformLogsQuery = () => query(platformLogsRef(), orderBy('createdAt', 'desc'), limit(200));

export const featureFlagsQuery = () => query(featureFlagsRef());

export function setFeatureFlag(flagId: string, enabled: boolean, description?: string) {
  return setDoc(
    featureFlagRef(flagId),
    {
      enabled,
      ...(description !== undefined ? { description } : {}),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.email ?? null,
    } as never,
    { merge: true },
  );
}

