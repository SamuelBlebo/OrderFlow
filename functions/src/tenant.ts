import { getFirestore } from 'firebase-admin/firestore';
import type { WhatsappCredentials } from './types';

export const db = () => getFirestore();

export const orgRef = (orgId: string) => db().collection('organizations').doc(orgId);
export const productsRef = (orgId: string) => orgRef(orgId).collection('products');
export const ordersRef = (orgId: string) => orgRef(orgId).collection('orders');
export const customersRef = (orgId: string) => orgRef(orgId).collection('customers');
export const sessionsRef = (orgId: string) => orgRef(orgId).collection('sessions');
export const credentialsRef = (orgId: string) => orgRef(orgId).collection('private').doc('whatsapp');
export const routingRef = (phoneNumberId: string) => db().collection('waRouting').doc(phoneNumberId);

/** Maps an inbound Meta phone_number_id to exactly one tenant. */
export async function resolveOrgId(phoneNumberId: string): Promise<string | null> {
  const snap = await routingRef(phoneNumberId).get();
  return snap.exists ? ((snap.get('orgId') as string) ?? null) : null;
}

export async function loadCredentials(orgId: string): Promise<WhatsappCredentials | null> {
  const snap = await credentialsRef(orgId).get();
  return snap.exists ? (snap.data() as WhatsappCredentials) : null;
}

export interface OrgProfile {
  name: string;
  currency: string;
  deliveryFee: number;
  greeting: string;
  supportPhone?: string;
}

export async function loadOrgProfile(orgId: string): Promise<OrgProfile> {
  const snap = await orgRef(orgId).get();
  const data = snap.data() ?? {};
  return {
    name: (data.name as string) ?? 'Our shop',
    currency: (data.currency as string) ?? 'GHS',
    deliveryFee: (data.deliveryFee as number) ?? 0,
    greeting: (data.greeting as string) ?? 'Welcome! Browse our items and order right here.',
    supportPhone: data.supportPhone as string | undefined,
  };
}

export function money(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}
