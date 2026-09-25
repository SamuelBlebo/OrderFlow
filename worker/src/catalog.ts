import type { Env } from './env';
import { getDoc, queryCollection } from './firestore';
import type { Product } from './types';

const CATALOG_PAGE_SIZE = 9;
/** How many active products a name search considers — a soft cap that fits this product's target market (a small WhatsApp shop), not a paginated search. */
const NAME_SEARCH_LIMIT = 50;

/**
 * Every product this org has marked active, cheapest-first-by-name — the
 * same `active == true, orderBy name` query as showCatalog in the old Cloud
 * Functions bot, reusing the composite index already declared in
 * firestore.indexes.json (no index changes needed for this Worker).
 */
export async function listActiveProducts(env: Env, orgId: string, limit = CATALOG_PAGE_SIZE): Promise<Product[]> {
  const rows = await queryCollection(env, `organizations/${orgId}`, 'products', {
    where: [{ field: 'active', op: 'EQUAL', value: true }],
    orderBy: [{ field: 'name' }],
    limit,
  });
  return rows.map((row) => ({ id: row.id, ...(row.data as Omit<Product, 'id'>) }));
}

export async function getProduct(env: Env, orgId: string, productId: string): Promise<Product | null> {
  const data = await getDoc(env, `organizations/${orgId}/products/${productId}`);
  return data ? { id: productId, ...(data as Omit<Product, 'id'>) } : null;
}

/**
 * "Add product by name" — a customer typing "jollof" or "Jollof Rice" while
 * browsing. Exact (case-insensitive) match wins; otherwise a name has to be
 * the *only* active product containing that text, so "rice" with two rice
 * dishes on the menu asks the customer to be more specific rather than
 * guessing which one they meant.
 */
export async function findProductByName(env: Env, orgId: string, query: string): Promise<Product | null> {
  const products = await listActiveProducts(env, orgId, NAME_SEARCH_LIMIT);
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const exact = products.find((product) => product.name.toLowerCase() === needle);
  if (exact) return exact;

  const matches = products.filter((product) => product.name.toLowerCase().includes(needle));
  return matches.length === 1 ? matches[0] : null;
}
