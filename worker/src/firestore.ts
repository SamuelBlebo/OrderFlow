import type { Env } from './env';
import { getAccessToken } from './firestoreAuth';

/**
 * Minimal Firestore REST client — the Worker equivalent of the handful of
 * firebase-admin calls the old Cloud Functions bot made: read a document,
 * upsert one, run a simple query, and (for real order creation, see
 * orders.ts) a proper interactive transaction — begin, batchGet, commit —
 * so an order number, stock reservation and customer stats either all land
 * or none do, the same guarantee `runTransaction` gave the old bot.
 */

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

function toValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value as Record<string, unknown>) } };
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

function toFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) fields[key] = toValue(value);
  }
  return fields;
}

function fromValue(value: FirestoreValue | undefined): unknown {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return fromFields(value.mapValue.fields ?? {});
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromValue);
  return null;
}

function fromFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) data[key] = fromValue(value);
  return data;
}

async function authedFetch(env: Env, url: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken(env);
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

function baseDocumentsUrl(env: Env): string {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

function documentsUrl(env: Env, path: string): string {
  return `${baseDocumentsUrl(env)}/${path}`;
}

/** Reads one document by its path (e.g. "organizations/abc/customers/xyz"). Returns null if it doesn't exist. */
export async function getDoc(env: Env, path: string): Promise<Record<string, unknown> | null> {
  const response = await authedFetch(env, documentsUrl(env, path));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore get failed (${response.status}): ${await response.text()}`);
  const body = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  return fromFields(body.fields ?? {});
}

/**
 * Upserts a document at `path`. With no `merge` list this replaces the whole
 * document (like the client SDK's plain `setDoc`); with one, only those
 * fields are touched (like `{ merge: true }` scoped to specific keys) — the
 * REST API needs the field list named explicitly, it has no boolean form.
 */
export async function setDoc(env: Env, path: string, data: Record<string, unknown>, opts?: { merge?: string[] }): Promise<void> {
  const query = opts?.merge?.length
    ? `?${opts.merge.map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&')}`
    : '';
  const response = await authedFetch(env, `${documentsUrl(env, path)}${query}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!response.ok) throw new Error(`Firestore set failed (${response.status}): ${await response.text()}`);
}

export interface QueryFilter {
  field: string;
  op: 'EQUAL' | 'LESS_THAN' | 'GREATER_THAN' | 'ARRAY_CONTAINS';
  value: unknown;
}

/** Runs a simple where + orderBy + limit query against one subcollection under `parentPath`. */
export async function queryCollection(
  env: Env,
  parentPath: string,
  collectionId: string,
  opts: { where?: QueryFilter[]; orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' }[]; limit?: number },
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const structuredQuery: Record<string, unknown> = { from: [{ collectionId }] };

  if (opts.where?.length === 1) {
    const [filter] = opts.where;
    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: filter.field },
        op: filter.op,
        value: toValue(filter.value),
      },
    };
  } else if (opts.where && opts.where.length > 1) {
    structuredQuery.where = {
      compositeFilter: {
        op: 'AND',
        filters: opts.where.map((filter) => ({
          fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: toValue(filter.value) },
        })),
      },
    };
  }
  if (opts.orderBy?.length) {
    structuredQuery.orderBy = opts.orderBy.map((o) => ({
      field: { fieldPath: o.field },
      direction: o.direction ?? 'ASCENDING',
    }));
  }
  if (opts.limit) structuredQuery.limit = opts.limit;

  const url = `${documentsUrl(env, parentPath)}:runQuery`;
  const response = await authedFetch(env, url, { method: 'POST', body: JSON.stringify({ structuredQuery }) });
  if (!response.ok) throw new Error(`Firestore query failed (${response.status}): ${await response.text()}`);

  const rows = (await response.json()) as Array<{ document?: { name: string; fields?: Record<string, FirestoreValue> } }>;
  return rows
    .filter((row): row is { document: { name: string; fields?: Record<string, FirestoreValue> } } => Boolean(row.document))
    .map((row) => ({
      id: row.document.name.split('/').pop() as string,
      data: fromFields(row.document.fields ?? {}),
    }));
}

/* ------------------------------- Transactions ------------------------------ */
/**
 * Only order creation needs these (see orders.ts) — everything else in the
 * Worker is a single read or write that doesn't need cross-document
 * consistency. `path` below is always relative, e.g. "organizations/abc/orders/xyz".
 */

export async function beginTransaction(env: Env): Promise<string> {
  const response = await authedFetch(env, `${baseDocumentsUrl(env)}:beginTransaction`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(`Firestore beginTransaction failed (${response.status}): ${await response.text()}`);
  const body = (await response.json()) as { transaction: string };
  return body.transaction;
}

/** Reads several documents at the transaction's snapshot. Missing documents come back as `null`, keyed by the same relative path passed in. */
export async function batchGet(
  env: Env,
  paths: string[],
  transaction: string,
): Promise<Record<string, Record<string, unknown> | null>> {
  const base = baseDocumentsUrl(env);
  const response = await authedFetch(env, `${base}:batchGet`, {
    method: 'POST',
    body: JSON.stringify({ documents: paths.map((path) => `${base}/${path}`), transaction }),
  });
  if (!response.ok) throw new Error(`Firestore batchGet failed (${response.status}): ${await response.text()}`);

  const rows = (await response.json()) as Array<{
    found?: { name: string; fields?: Record<string, FirestoreValue> };
    missing?: string;
  }>;
  const prefix = `${base}/`;
  const result: Record<string, Record<string, unknown> | null> = {};
  for (const row of rows) {
    if (row.found) {
      result[row.found.name.slice(prefix.length)] = fromFields(row.found.fields ?? {});
    } else if (row.missing) {
      result[row.missing.slice(prefix.length)] = null;
    }
  }
  return result;
}

export type TransactionWrite =
  | { kind: 'set'; path: string; data: Record<string, unknown> }
  | { kind: 'update'; path: string; data: Record<string, unknown>; mask: string[] };

/**
 * Commits every write atomically against the transaction `beginTransaction`
 * opened — either all of them land, or (if a document read along the way
 * changed since) none do and the caller must retry. `mask` field paths use
 * Firestore's dotted notation to reach into a nested map (e.g.
 * "subscription.ordersUsedThisPeriod") without touching sibling fields —
 * `data` must be shaped as the real nested object for that to work, not a
 * flat dotted key.
 */
export async function commitTransaction(env: Env, transaction: string, writes: TransactionWrite[]): Promise<void> {
  const base = baseDocumentsUrl(env);
  const body = {
    transaction,
    writes: writes.map((write) =>
      write.kind === 'set'
        ? { update: { name: `${base}/${write.path}`, fields: toFields(write.data) } }
        : {
            update: { name: `${base}/${write.path}`, fields: toFields(write.data) },
            updateMask: { fieldPaths: write.mask },
          },
    ),
  };
  const response = await authedFetch(env, `${base}:commit`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Firestore commit failed (${response.status}): ${await response.text()}`);
}
