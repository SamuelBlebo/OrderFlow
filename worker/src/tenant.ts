import type { Env } from './env';
import { getDoc } from './firestore';
import type { OrgProfile, WhatsappAccount } from './types';

/**
 * Resolves an inbound phone_number_id straight to its tenant + credentials —
 * mirrors loadWhatsappAccount in functions/src/tenant.ts exactly, same
 * top-level `whatsappAccounts/{phoneNumberId}` document.
 */
export async function loadWhatsappAccount(env: Env, phoneNumberId: string): Promise<WhatsappAccount | null> {
  const data = await getDoc(env, `whatsappAccounts/${phoneNumberId}`);
  return data ? (data as unknown as WhatsappAccount) : null;
}

export interface UserProfile {
  orgId: string;
  role: string;
}

/**
 * `users/{uid}` — the same doc Firestore rules' profile() helper and Cloud
 * Functions' requireOrg/requireAdmin read, so "who is this uid, and are they
 * allowed to change this org's WhatsApp connection" means the same thing
 * here as it does everywhere else in the app.
 */
export async function loadUserProfile(env: Env, uid: string): Promise<UserProfile | null> {
  const data = await getDoc(env, `users/${uid}`);
  if (!data?.orgId) return null;
  return { orgId: data.orgId as string, role: (data.role as string) ?? 'staff' };
}

export async function loadOrgProfile(env: Env, orgId: string): Promise<OrgProfile> {
  const data = (await getDoc(env, `organizations/${orgId}`)) ?? {};
  return {
    name: (data.name as string) ?? 'Our shop',
    currency: (data.currency as string) ?? 'GHS',
    deliveryFee: (data.deliveryFee as number) ?? 0,
    suspended: (data.suspended as boolean) ?? false,
  };
}

export function money(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}
