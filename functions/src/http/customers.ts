import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { broadcastsRef, loadCredentialsForOrg } from '../tenant';
import { sendText } from '../whatsapp/client';
import { broadcastInput } from '../types';
import { requireAdmin } from './guards';

/** How many WhatsApp sends run concurrently — a courtesy to Meta's rate limits, not a hard API cap. */
const BROADCAST_BATCH_SIZE = 10;

/**
 * A customer doc's id is their WhatsApp id already (see engine.ts's
 * `customersRef(orgId).doc(ctx.waId)`), so no extra lookup is needed to get
 * a `to` address — and since every id is only ever read through this org's
 * own `customers` subcollection, there is no way to address someone else's
 * tenant here.
 *
 * WhatsApp's 24-hour customer service window still applies: a recipient who
 * hasn't messaged this number recently can only be reached with a
 * Meta-approved message template, not this free-text send. That is enforced
 * by Meta's Graph API itself — a send outside the window simply fails and
 * shows up in `failedCount` below, the same as any other delivery failure.
 */
export const sendBroadcast = onCall({ timeoutSeconds: 300 }, async (request) => {
  const { orgId, uid } = await requireAdmin(request.auth);
  const parsed = broadcastInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Check the message and recipients.');

  const { message, customerIds } = parsed.data;

  const creds = await loadCredentialsForOrg(orgId);
  if (!creds) throw new HttpsError('failed-precondition', 'Connect a WhatsApp number first.');

  let sentCount = 0;
  const failedIds: string[] = [];

  for (let i = 0; i < customerIds.length; i += BROADCAST_BATCH_SIZE) {
    const batch = customerIds.slice(i, i + BROADCAST_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((id) => sendText(creds, id, message)));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.ok) sentCount += 1;
      else failedIds.push(batch[index]);
    });
  }

  await broadcastsRef(orgId).add({
    message,
    audienceSize: customerIds.length,
    sentCount,
    failedCount: failedIds.length,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info('Broadcast sent', {
    orgId,
    audienceSize: customerIds.length,
    sentCount,
    failedCount: failedIds.length,
  });

  return { ok: true as const, sentCount, failedCount: failedIds.length };
});
