import { limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { orderRef, ordersRef } from '@/firebase';
import type { OrderStatus } from '@/types';

export const ordersQuery = (orgId: string) =>
  query(ordersRef(orgId), orderBy('createdAt', 'desc'));

export const recentOrdersQuery = (orgId: string, count = 5) =>
  query(ordersRef(orgId), orderBy('createdAt', 'desc'), limit(count));

export const pendingOrdersQuery = (orgId: string) =>
  query(ordersRef(orgId), where('status', '==', 'pending'), orderBy('createdAt', 'desc'));

/**
 * Only the status changes here. The customer's WhatsApp message is sent by a
 * Cloud Function watching this document, so the browser never holds a Meta token.
 */
export function setOrderStatus(orgId: string, orderId: string, status: OrderStatus) {
  return updateDoc(orderRef(orgId, orderId), { status, updatedAt: serverTimestamp() } as never);
}
