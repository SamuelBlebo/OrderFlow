import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from './config';
import type { Broadcast, Customer, Order, OrderItem, Organization, Product, UserProfile } from '@/types';

/**
 * Every tenant-owned collection hangs off /organizations/{orgId}.
 * Nothing else in the app builds a Firestore path by hand, so tenant scoping
 * is impossible to forget.
 */
export const paths = {
  organizations: 'organizations',
  users: 'users',
  products: 'products',
  customers: 'customers',
  orders: 'orders',
  orderItems: 'orderItems',
  broadcasts: 'broadcasts',
} as const;

export const orgsRef = () =>
  collection(db, paths.organizations) as CollectionReference<Organization>;

export const orgRef = (orgId: string) =>
  doc(db, paths.organizations, orgId) as DocumentReference<Organization>;

export const userRef = (uid: string) =>
  doc(db, paths.users, uid) as DocumentReference<UserProfile>;

export const productsRef = (orgId: string) =>
  collection(db, paths.organizations, orgId, paths.products) as CollectionReference<Product>;

export const productRef = (orgId: string, productId: string) =>
  doc(db, paths.organizations, orgId, paths.products, productId) as DocumentReference<Product>;

export const customersRef = (orgId: string) =>
  collection(db, paths.organizations, orgId, paths.customers) as CollectionReference<Customer>;

export const customerRef = (orgId: string, customerId: string) =>
  doc(db, paths.organizations, orgId, paths.customers, customerId) as DocumentReference<Customer>;

export const broadcastsRef = (orgId: string) =>
  collection(db, paths.organizations, orgId, paths.broadcasts) as CollectionReference<Broadcast>;

export const ordersRef = (orgId: string) =>
  collection(db, paths.organizations, orgId, paths.orders) as CollectionReference<Order>;

export const orderRef = (orgId: string, orderId: string) =>
  doc(db, paths.organizations, orgId, paths.orders, orderId) as DocumentReference<Order>;

/**
 * Normalized copy of an order's own `items` array, written once by the bot.
 * The dashboard renders `order.items` directly — this exists for the case
 * that needs one item on its own (a per-product query, a future edit flow).
 */
export const orderItemsRef = (orgId: string, orderId: string) =>
  collection(
    db,
    paths.organizations,
    orgId,
    paths.orders,
    orderId,
    paths.orderItems,
  ) as CollectionReference<OrderItem>;

/** Storage path for a product photo, also tenant-scoped. */
export const productImagePath = (orgId: string, productId: string, fileName: string) =>
  `organizations/${orgId}/products/${productId}/${fileName}`;
