# Platform admin guide

For OrderFlow staff operating the platform — not for merchants. If you're a
merchant, see the in-app Help Center (`/help`) instead.

## Getting access

Platform admin is a separate grant from being a merchant, and there is no
self-serve way to get it — deliberately, so nobody can promote themselves.
Someone with Firebase console or Admin SDK access has to create your grant:

```js
await db.collection('platformAdmins').doc(YOUR_UID).set({
  grantedAt: FieldValue.serverTimestamp(),
});
```

Your UID is under Firebase console → Authentication → Users. Once the
document exists, signing in takes you straight to `/admin` — there's no
`/users/{uid}` profile involved at all for a platform admin, so you don't
need to be a merchant anywhere to get this.

To revoke access, delete that same document.

## What's at `/admin`

**Dashboard** (`/admin`) — platform-wide metrics, computed live at request
time (not pre-aggregated, so there's a small delay under heavy load, never
stale data): total merchants, active vs. suspended, and estimated MRR
(`PLAN_PRICES_USD` × active orgs on each plan — a USD-baseline estimate, not
what merchants actually pay in their own currency; see `functions/src/billing.ts`
for why the reference price and the actual local-currency price diverge).

**Merchants** (`/admin/merchants`) — every organization on the platform,
regardless of tenant. From here:

- **Suspend** a merchant: their WhatsApp bot stops taking orders (customers
  get "This shop is temporarily unavailable"), their dashboard still loads
  read-only. Use this for ToS violations or a billing dispute, not as a
  soft-delete.
- **Unsuspend** reverses it immediately.
- **Delete** a merchant: irreversible, removes their organization and data.
  Requires typing the exact business name to confirm — there's no undo, so
  don't use this for "temporarily disable," use Suspend for that.

Every suspend/unsuspend/delete is logged automatically (see Logs below) —
you don't need to separately note why you did something, but the `detail`
field on each action is a good place to.

**Logs** (`/admin/logs`) — the audit trail every admin action above writes
to (`platformLogs` collection): who did what, to which merchant, when.
Read-only from the UI; nothing here is ever deleted automatically.

**Feature flags** (`/admin/flags`) — platform-wide toggles stored in
`featureFlags/{flagId}`. Check the current codebase for what actually reads
a given flag before assuming toggling it does anything — a flag existing in
this collection doesn't guarantee application code branches on it.

## Things this surface does NOT do (yet)

- **No way to see or copy a merchant's WhatsApp access token** from the UI —
  it lives only in `whatsappAccounts/{phoneNumberId}`, a collection with no
  client-facing Firestore rule at all (`allow read, write: if false`). If you
  need it for support/debugging, that's a Firebase console / Admin SDK job,
  and you should have a real reason to be looking at a merchant's credentials.
- **No impersonation** — you cannot log in "as" a merchant from `/admin`.
- **No refund or billing-adjustment tool** — Paystack disputes/refunds happen
  in the Paystack dashboard directly; nothing here reaches into a specific
  transaction.

## Common operational tasks

**A merchant's WhatsApp stopped responding.** Check (in order): is their org
suspended (Merchants page)? Is `PAYSTACK_SECRET_KEY`/`WHATSAPP_VERIFY_TOKEN`/
`META_APP_SECRET` actually set where each is expected (Firebase Secret
Manager for Functions, `wrangler secret` for the Worker — see
`PRODUCTION_CHECKLIST.md`)? Check `wrangler tail` for the Worker (that's
where inbound message handling lives now, not Cloud Functions logs — see
root `README.md`'s "Why two backends?").

**A merchant disputes a charge.** Paystack dashboard is the source of truth
for what was actually charged. `organizations/{orgId}.subscription` on
Firestore records what OrderFlow believes happened (`externalCustomerId`,
`externalSubscriptionId` — actually a saved card authorization, not a
Paystack Subscription object, see `functions/src/http/billing.ts`) — cross-
reference the two rather than trusting either alone.

**Provisioning the very first admin on a new deploy.** See "Getting access"
above — there's no chicken-and-egg problem since it's done via the Firebase
console/Admin SDK, not through the app itself.
