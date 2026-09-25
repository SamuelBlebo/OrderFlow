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
