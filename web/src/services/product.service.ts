import {
  addDoc,
  deleteDoc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { productRef, productsRef } from '@/firebase';
import type { ProductInput } from '@/utils/validation';

export const productsQuery = (orgId: string) =>
  query(productsRef(orgId), orderBy('createdAt', 'desc'));

/** What the WhatsApp bot is allowed to show a customer. */
export const publishedProductsQuery = (orgId: string) =>
  query(productsRef(orgId), where('published', '==', true), orderBy('name'));

export function createProduct(orgId: string, input: ProductInput) {
  return addDoc(productsRef(orgId), {
    ...input,
    imageUrl: null,
    imagePath: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as never);
}

export function updateProduct(orgId: string, productId: string, patch: Partial<ProductInput>) {
  return updateDoc(productRef(orgId, productId), {
    ...patch,
    updatedAt: serverTimestamp(),
  } as never);
}

export function deleteProduct(orgId: string, productId: string) {
  return deleteDoc(productRef(orgId, productId));
}
