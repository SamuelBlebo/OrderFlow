import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { META_APP_SECRET, WHATSAPP_VERIFY_TOKEN } from '../config';
import { loadCredentials, resolveOrgId } from '../tenant';
import { handleMessage } from '../bot/engine';
import { markAsRead } from './client';
import { verifySignature } from './signature';
import type { WebhookValue } from '../types';

/**
 * Single public entry point for every merchant. The receiving phone_number_id
 * decides which tenant the message belongs to; nothing else is trusted.
 */
export const whatsappWebhook = onRequest(
  { secrets: [WHATSAPP_VERIFY_TOKEN, META_APP_SECRET], concurrency: 40 },
  async (req, res) => {
    // ---- Meta subscription handshake ----
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN.value()) {
        res.status(200).send(String(challenge ?? ''));
      } else {
        res.status(403).send('Verification failed');
      }
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!raw || !verifySignature(raw, req.get('x-hub-signature-256'), META_APP_SECRET.value())) {
      logger.warn('Rejected webhook with bad signature');
      res.status(401).send('Invalid signature');
      return;
    }

    // Meta retries anything that is not answered within seconds, so acknowledge
    // first and let processing failures surface in logs instead of retries.
    res.status(200).send('EVENT_RECEIVED');

    try {
      const entries = (req.body?.entry ?? []) as Array<{ changes?: Array<{ value?: WebhookValue }> }>;
      for (const entry of entries) {
        for (const change of entry.changes ?? []) {
          await processChange(change.value);
        }
      }
    } catch (err) {
      logger.error('Webhook processing failed', err);
    }
  },
);

async function processChange(value?: WebhookValue): Promise<void> {
  const messages = value?.messages ?? [];
  if (messages.length === 0) return; // delivery receipts and read statuses

  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const orgId = await resolveOrgId(phoneNumberId);
  if (!orgId) {
    logger.warn('Inbound message for an unknown number', { phoneNumberId });
    return;
  }

  const creds = await loadCredentials(orgId);
  if (!creds) {
    logger.warn('Tenant has no stored WhatsApp credentials', { orgId });
    return;
  }

  const profileName = value?.contacts?.[0]?.profile?.name ?? '';

  for (const message of messages) {
    try {
      await markAsRead(creds, message.id);
      await handleMessage(orgId, creds, message, profileName);
    } catch (err) {
      logger.error('Bot failed on a message', { orgId, messageId: message.id, err });
    }
  }
}
