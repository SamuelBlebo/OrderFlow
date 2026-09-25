/**
 * Mirrors the shapes in functions/src/types.ts — kept as a separate copy
 * because the Worker is a standalone deployable with no shared package, not
 * because the schema is meant to diverge. Update both together.
 */

export interface InboundMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: 'list_reply' | 'button_reply';
    list_reply?: { id: string; title: string };
    button_reply?: { id: string; title: string };
  };
}

export interface WebhookValue {
  metadata?: { phone_number_id?: string };
  messages?: InboundMessage[];
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  statuses?: unknown[];
}

export interface WebhookBody {
  entry?: Array<{ changes?: Array<{ value?: WebhookValue }> }>;
}

export type WebhookStatus = 'pending' | 'verified' | 'disconnected';

/** The `whatsappAccounts/{phoneNumberId}` document — resolves an inbound call to its tenant. */
export interface WhatsappAccount {
  organizationId: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhone: string;
  accessToken: string;
  webhookStatus: WebhookStatus;
}

export interface OrgProfile {
  name: string;
  currency: string;
  deliveryFee: number;
  suspended: boolean;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  active: boolean;
  stock?: number | null;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export type SessionStep =
  | 'idle'
  | 'catalog'
  | 'awaiting_qty'
  | 'awaiting_name'
  | 'awaiting_address'
  | 'awaiting_confirm';

/**
 * `organizations/{orgId}/sessions/{waId}` — one cart/conversation per
 * customer per merchant, by construction (the path is scoped to both).
 * Reuses the exact collection the old Cloud Functions bot wrote to, so the
 * existing `cleanupSessions` scheduled function keeps purging stale ones.
 */
export interface Session {
  step: SessionStep;
  cart: OrderItem[];
  /** Ordered product ids from the last catalog page shown, so a bare "2" reply resolves to a product. */
  catalogProductIds: string[];
  pendingProductId: string | null;
  draftName: string | null;
  draftAddress: string | null;
  handledMessageIds: string[];
  updatedAt: string;
}
