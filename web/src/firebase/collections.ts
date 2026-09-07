import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from './config';
import type { Customer, Order, Organization, Product, UserProfile } from '@/types';

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

export const ordersRef = (orgId: string) =>
  collection(db, paths.organizations, orgId, paths.orders) as CollectionReference<Order>;

export const orderRef = (orgId: string, orderId: string) =>
  doc(db, paths.organizations, orgId, paths.orders, orderId) as DocumentReference<Order>;

/** Storage path for a product photo, also tenant-scoped. */
export const productImagePath = (orgId: string, productId: string, fileName: string) =>
  `organizations/${orgId}/products/${productId}/${fileName}`;
