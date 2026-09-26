# Production launch checklist

Everything between "the code builds" and "a real merchant can rely on this."
Ordered roughly the way you'd actually work through it — later items assume
earlier ones are done.

## 1. Accounts and billing

- [ ] Firebase project on the **Blaze** plan (Cloud Functions won't deploy without it)
- [ ] Cloudflare account, `wrangler login` run locally (for the WhatsApp Worker)
- [ ] Meta Developer account, app with the **WhatsApp** product added
- [ ] Paystack account — test-mode keys first, live keys only after step 6 below

## 2. Deploy the platform

Follow the root `README.md`'s "Deploying to production" section in order, then
`worker/README.md` for the WhatsApp Worker specifically. In short:

- [ ] `firestore.rules` + `firestore.indexes.json` + `storage.rules` deployed
- [ ] Cloud Functions deployed (`firebase deploy --only functions`)
- [ ] WhatsApp Worker deployed (`wrangler deploy` from `worker/`), Meta webhook pointed at it
- [ ] Web app built and deployed to Hosting
- [ ] First platform admin provisioned (see README's "Platform admin is a separate grant")

## 3. Verify the core loop, for real

Don't trust that it deploys — trust that it works:

- [ ] Sign up as a merchant, land on `/dashboard`
- [ ] Connect a real WhatsApp number via **Connect WhatsApp** on `/whatsapp` (Embedded Signup — this
      is the only merchant-facing way in now; see `PLATFORM_SETUP.md` for the one-time setup it needs
      and `MERCHANT_ONBOARDING.md`'s testing steps)
- [ ] Add at least one product
- [ ] Message the connected number from a phone: browse the catalog, add an item, checkout, confirm
- [ ] The resulting order appears on `/orders`, the customer on `/customers`, the conversation on `/inbox`
- [ ] Move the order through Preparing → Out for Delivery → Delivered; confirm the customer gets a
      WhatsApp message at each step and the delivery timeline fills in

## 4. Required for merchants to self-connect WhatsApp at all

Not optional anymore — the WhatsApp page has no other way in (no developer
fields, no manual form). Until this is done, `/whatsapp` shows a calm "not
set up yet" message; nothing crashes, merchants just can't connect yet.

- [ ] **`PLATFORM_SETUP.md`** — the full walkthrough: Meta App, Facebook Login for Business,
      Embedded Signup Configuration, `META_APP_ID`/`META_APP_SECRET` on the Worker,
      `VITE_META_APP_ID`/`VITE_META_CONFIGURATION_ID`/`VITE_WHATSAPP_WORKER_URL` on the web app. Untested
      against a live Meta App — see `worker/src/whatsappConnect.ts`'s comment.
- [ ] Business Verification completed in Meta Business Manager (required before real external
      merchants — not just you testing — can complete the flow; can take hours to days)

## 5. Optional integrations — only if you want them live

- [ ] **Paystack billing**: `PAYSTACK_SECRET_KEY` set, `billingWebhook`'s URL added in the Paystack
      dashboard. **Test with Paystack's test-mode keys and test cards before flipping to live keys** —
      this has not been exercised against any real Paystack account. Walk through: upgrade a test org,
      confirm the webhook flips the plan, confirm `renewSubscriptions` (scheduled, every 24h) would
      pick it up when `renewsAt` passes, confirm downgrading to Free stops future renewal charges.
- [ ] **Sentry error monitoring**: `VITE_SENTRY_DSN` set (web only — see below for Functions/Worker)
- [ ] **Firebase Analytics**: enable Analytics for the project in Firebase console, then set
      `VITE_FIREBASE_MEASUREMENT_ID`

## 6. Monitoring — what you get for free, and what you don't

- **Cloud Functions**: uncaught exceptions already go to Google Cloud's Error Reporting
  automatically — no setup. Check it at
  `console.cloud.google.com/errors` for your project, or `firebase functions:log`.
- **Cloudflare Worker**: `console.error` calls show up in `wrangler tail` (live) or the Cloudflare
  dashboard's Worker logs (recent history). There's no persistent, queryable error store built in —
  if you need one, Cloudflare has Logpush to an external sink (not configured here).
- **Web app**: nothing by default beyond the browser console. Set `VITE_SENTRY_DSN` (see above) if
  you want unhandled render errors (`ErrorBoundary`) reported somewhere you'll actually see them.

## 7. Backups

Firestore has no backups enabled by default. Turn on scheduled backups before you have real
merchant data worth losing:

```bash
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d \
  --project=YOUR_PROJECT_ID
```

(Or Firebase console → Firestore → Backups.) This is a project-level GCP setting, not application
code — nothing in this repo does it for you.

## 8. Rate limits and abuse

Already built in, worth knowing about rather than configuring:

- Inbound WhatsApp messages: 20/minute per customer per org (`worker` — currently *not* enforced,
  see note below)
- Broadcasts: 3/hour per org (`functions/src/rateLimit.ts` via `sendBroadcast`)
- Merchant replies from the Inbox: 60/minute per org (`sendReply`)

**Note**: the original Cloud Functions bot rate-limited inbound messages per customer
(`checkRateLimit` in `functions/src/rateLimit.ts`); the Worker version (`worker/src/bot.ts`) does not
currently re-implement this, since the Worker's Firestore-over-REST client has no equivalent
transaction-backed counter yet. Low risk at small scale, worth adding before high traffic.

## 9. Data and access review

- [ ] Confirm `firestore.rules` still denies everything not explicitly matched (the catch-all at the
      bottom) — re-read it after any schema change, not just this one
- [ ] Confirm no access token, API secret, or service-account key is committed anywhere (`git log -p`
      isn't a bad idea before a first public push)
- [ ] Confirm secrets are set the right place and never committed: `FIREBASE_SERVICE_ACCOUNT`,
      `WHATSAPP_VERIFY_TOKEN`, and `META_APP_SECRET` via `wrangler secret put` (Worker only —
      `wrangler.toml` holds no secrets); `PAYSTACK_SECRET_KEY` via `firebase functions:secrets:set`
      (Functions only — never in `functions/.env`, which is for non-secret params like `META_APP_ID`)
- [ ] Confirm the WhatsApp access token itself never left `whatsappAccounts/` — check
      `organizations/{orgId}.whatsapp` in the Firebase console for any org and verify it holds no
      token, only the non-secret fields (`connected`, `displayPhoneNumber`, `qualityRating`, etc.)

## 10. Docs for the people who'll actually run this

- Merchant-facing help: `/help` in the app, and `MERCHANT_ONBOARDING.md` for the WhatsApp connect
  flow specifically
- Platform-owner one-time setup: `PLATFORM_SETUP.md`
- Platform-staff day-to-day operations: `docs/admin-guide.md`
- Everything else in this checklist assumes you've read the root `README.md` and `worker/README.md`
