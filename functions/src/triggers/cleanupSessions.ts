import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import { SESSION_TTL_MINUTES } from '../config';
import { db } from '../tenant';

/**
 * Abandoned carts should not resurface days later mid-checkout. Sessions are
 * dropped once they go quiet.
 */
export const cleanupSessions = onSchedule('every 6 hours', async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - SESSION_TTL_MINUTES * 60 * 1000);
  const stale = await db()
    .collectionGroup('sessions')
    .where('updatedAt', '<', cutoff)
    .limit(500)
    .get();

  if (stale.empty) return;

  const batch = db().batch();
  stale.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  logger.info('Cleared stale sessions', { count: stale.size });
});
