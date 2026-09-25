import type { Env } from './env';
import { getDoc, setDoc } from './firestore';
import type { Session, SessionStep } from './types';

const EMPTY_SESSION: Omit<Session, 'updatedAt'> = {
  step: 'idle',
  cart: [],
  catalogProductIds: [],
  pendingProductId: null,
  draftName: null,
  draftAddress: null,
  handledMessageIds: [],
};

function sessionPath(orgId: string, waId: string): string {
  return `organizations/${orgId}/sessions/${waId}`;
}

export async function loadSession(env: Env, orgId: string, waId: string): Promise<Session> {
  const data = await getDoc(env, sessionPath(orgId, waId));
  if (!data) return { ...EMPTY_SESSION, updatedAt: new Date().toISOString() };

  return {
    step: (data.step as SessionStep) ?? 'idle',
    cart: (data.cart as Session['cart']) ?? [],
    catalogProductIds: (data.catalogProductIds as string[]) ?? [],
    pendingProductId: (data.pendingProductId as string | null) ?? null,
    draftName: (data.draftName as string | null) ?? null,
    draftAddress: (data.draftAddress as string | null) ?? null,
    handledMessageIds: (data.handledMessageIds as string[]) ?? [],
    updatedAt: (data.updatedAt as string) ?? new Date().toISOString(),
  };
}

/**
 * Always writes the whole session (never a partial merge) — `next` already
 * carries every field forward from the session `route()` started with, so a
 * full overwrite can't accidentally drop something a merge would have kept.
 * WhatsApp retries a delivery it didn't get a fast-enough response to, so the
 * last 20 message ids ride along to make re-processing a no-op.
 */
export async function saveSession(
  env: Env,
  orgId: string,
  waId: string,
  next: Session,
  handledMessageId: string,
): Promise<void> {
  await setDoc(env, sessionPath(orgId, waId), {
    step: next.step,
    cart: next.cart,
    catalogProductIds: next.catalogProductIds,
    pendingProductId: next.pendingProductId,
    draftName: next.draftName,
    draftAddress: next.draftAddress,
    handledMessageIds: [...next.handledMessageIds, handledMessageId].slice(-20),
    updatedAt: new Date(),
  });
}
