import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import { orgRef } from '../tenant';
import { requireAdmin } from './guards';

export const changePlanInput = z.object({
  plan: z.enum(['free', 'starter', 'growth', 'pro']),
});

/**
 * The only way an org's plan changes — firestore.rules blocks a client from
 * writing `subscription.*` directly, so a merchant can't grant themselves a
 * paid tier for free. Downgrading to Free needs no payment and applies
 * immediately. Upgrading to a paid tier is where a real Stripe or Paystack
 * checkout session belongs (see the TODO below); until credentials exist,
 * this refuses clearly instead of pretending to have charged anyone.
 */
export const changePlan = onCall(async (request) => {
  const { orgId } = await requireAdmin(request.auth);
  const parsed = changePlanInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid plan.');

  const { plan } = parsed.data;

  if (plan === 'free') {
    await orgRef(orgId).update({
      'subscription.plan': 'free',
      'subscription.status': 'active',
      'subscription.renewsAt': null,
      'subscription.paymentProvider': null,
      'subscription.externalCustomerId': null,
      'subscription.externalSubscriptionId': null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true as const, checkoutUrl: null };
  }

  // TODO(stripe/paystack): create a checkout session for `plan` here, e.g.
  //   Stripe:   stripe.checkout.sessions.create({ mode: 'subscription', customer, line_items: [...], success_url, cancel_url })
  //   Paystack: paystack.transaction.initialize({ email, amount, plan: <paystack plan code>, metadata: { orgId, plan } })
  // Return the session's redirect URL as `checkoutUrl` for the client to
  // follow. Do NOT flip subscription.plan here — only billingWebhook, after
  // verifying the provider actually confirms payment, should apply it.
  logger.info('Plan upgrade requested with no payment provider configured', { orgId, plan });
  throw new HttpsError(
    'unimplemented',
    'Payment processing is not connected yet. Add Stripe or Paystack credentials to enable paid plan upgrades.',
  );
});

/**
 * Where Stripe or Paystack would deliver payment events. Not wired to a real
 * provider yet: the first things a real implementation needs are (1) reading
 * the raw body and verifying the signature — Stripe via STRIPE_WEBHOOK_SECRET
 * and `stripe.webhooks.constructEvent`, Paystack via an HMAC-SHA512 check
 * against PAYSTACK_SECRET_KEY — then (2) mapping the event's org (from
 * metadata set at checkout) to `subscription.plan`/`status`/`renewsAt`/
 * `externalSubscriptionId`. Until then this just returns 200 so a provider's
 * retry logic doesn't treat every delivery attempt as a failure.
 */
export const billingWebhook = onRequest((req, res) => {
  logger.info('Billing webhook received with no payment provider configured', {
    userAgent: req.get('user-agent'),
  });
  res.status(200).send('OK');
});
