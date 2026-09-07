import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { GRAPH_VERSION, TRIAL_DAYS } from '../config';
import { credentialsRef, db, loadCredentials, orgRef, routingRef } from '../tenant';
import { sendText } from '../whatsapp/client';
import { connectWhatsappInput, createOrgInput, testMessageInput } from '../types';

function requireAuth(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return auth;
}

function requireOrg(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  const user = requireAuth(auth);
  const orgId = user.token.orgId as string | undefined;
  if (!orgId) throw new HttpsError('failed-precondition', 'This account has no business yet.');
  return { uid: user.uid, orgId, role: (user.token.role as string) ?? 'staff' };
}

function requireAdmin(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  const ctx = requireOrg(auth);
  if (!['owner', 'admin'].includes(ctx.role)) {
    throw new HttpsError('permission-denied', 'Only owners and admins can do this.');
  }
  return ctx;
}

/**
 * Provisions a tenant and stamps orgId/role onto the caller's ID token. Every
 * security rule keys off those claims, so this is the only place a user is
 * bound to a business.
 */
export const createOrganization = onCall(async (request) => {
  const user = requireAuth(request.auth);
  if (user.token.orgId) {
    return { orgId: user.token.orgId as string };
  }

  const parsed = createOrgInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Check the details you sent.');

  const { businessName, fullName } = parsed.data;
  const org = orgRef(db().collection('organizations').doc().id);
  const trialEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const batch = db().batch();
  batch.set(org, {
    name: businessName,
    country: 'GH',
    currency: 'GHS',
    deliveryFee: 0,
    greeting: `Welcome to ${businessName}. Browse our items and order right here on WhatsApp.`,
    plan: 'trial',
    trialEndsAt,
    whatsappStatus: 'disconnected',
    whatsappPhone: null,
    orderCounter: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(org.collection('members').doc(user.uid), {
    email: request.auth?.token.email ?? null,
    fullName,
    role: 'owner',
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(db().collection('users').doc(user.uid), {
    orgId: org.id,
    role: 'owner',
    fullName,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  await getAuth().setCustomUserClaims(user.uid, { orgId: org.id, role: 'owner' });
  logger.info('Organization created', { orgId: org.id, uid: user.uid });

  return { orgId: org.id };
});

/**
 * Verifies the credentials against Meta before storing them, then claims the
 * phone_number_id in the routing table so inbound messages find this tenant.
 */
export const connectWhatsapp = onCall(async (request) => {
  const { orgId } = requireAdmin(request.auth);
  const parsed = connectWhatsappInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Check the values you copied.');

  const { phoneNumberId, wabaId, displayPhone, accessToken } = parsed.data;

  const probe = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION.value()}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!probe.ok) {
    throw new HttpsError('invalid-argument', 'Meta rejected that token or phone number ID.');
  }

  // A phone number can only ever belong to one tenant.
  const routing = routingRef(phoneNumberId);
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(routing);
    if (existing.exists && existing.get('orgId') !== orgId) {
      throw new HttpsError('already-exists', 'That number is connected to another business.');
    }
    tx.set(routing, { orgId, updatedAt: FieldValue.serverTimestamp() });
    tx.set(credentialsRef(orgId), { phoneNumberId, wabaId, displayPhone, accessToken });
    tx.update(orgRef(orgId), { whatsappStatus: 'connected', whatsappPhone: displayPhone });
  });

  return { ok: true as const, displayPhone };
});

export const disconnectWhatsapp = onCall(async (request) => {
  const { orgId } = requireAdmin(request.auth);
  const creds = await loadCredentials(orgId);

  const batch = db().batch();
  if (creds) batch.delete(routingRef(creds.phoneNumberId));
  batch.delete(credentialsRef(orgId));
  batch.update(orgRef(orgId), { whatsappStatus: 'disconnected', whatsappPhone: null });
  await batch.commit();

  return { ok: true as const };
});

export const sendTestMessage = onCall(async (request) => {
  const { orgId } = requireAdmin(request.auth);
  const parsed = testMessageInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Enter a valid phone number.');

  const creds = await loadCredentials(orgId);
  if (!creds) throw new HttpsError('failed-precondition', 'Connect a WhatsApp number first.');

  const result = await sendText(
    creds,
    parsed.data.to.replace(/\D/g, ''),
    'Your OrderFlow connection is working. Customers can now order from this number.',
  );
  if (!result.ok) throw new HttpsError('internal', 'WhatsApp would not accept that message.');

  return { ok: true as const };
});
