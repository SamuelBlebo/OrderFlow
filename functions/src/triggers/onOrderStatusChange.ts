import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { loadCredentialsForOrg } from '../tenant';
import { sendText } from '../whatsapp/client';
import { statusUpdate } from '../bot/copy';
import type { OrderStatus } from '../types';

/**
 * Keeps the customer informed without the merchant typing anything. Fires only
 * when the status actually moves.
 */
export const onOrderStatusChange = onDocumentUpdated(
  'organizations/{orgId}/orders/{orderId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const previous = before.status as OrderStatus;
    const next = after.status as OrderStatus;
    if (previous === next) return;

    const message = statusUpdate[next]?.(after.number as number);
    if (!message) return;

    const orgId = event.params.orgId;
    const creds = await loadCredentialsForOrg(orgId);
    if (!creds) {
      logger.warn('Status changed but the tenant has no WhatsApp connection', { orgId });
      return;
    }

    await sendText(creds, String(after.customerId), message);
  },
);
