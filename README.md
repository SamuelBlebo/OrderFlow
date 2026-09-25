# OrderFlow

A multi-tenant SaaS that lets a small business sell through WhatsApp. Merchants sign up, connect
their WhatsApp Business number and upload products. Customers just message the business — no
account, no app, no website — and a Cloudflare Worker runs the chat, reading and writing the same
Firestore every merchant's dashboard uses.

## Repositories

Per the two-repo decision, this is the **web repo**. A future mobile client lives in its own
repository with its own copy of the Firebase config — nothing is shared through a workspace.

```
orderflow-web/          <- this repo
├── web/                 React (Vite + TypeScript) marketing site + merchant dashboard + platform admin
├── worker/               Cloudflare Worker — the WhatsApp webhook and bot (see worker/README.md)
├── functions/            Cloud Functions — everything else: connect/disconnect WhatsApp, billing,
│                          broadcasts, admin ops, order-status triggers
├── firestore.rules      Tenant isolation
├── firestore.indexes.json
├── storage.rules        Tenant-scoped product images
└── firebase.json        Hosting, emulators, deploy targets
```

**Why two backends?** The WhatsApp webhook used to be a Cloud Function. It moved to a Cloudflare
Worker so the core "a customer messages the business" path doesn't depend on Firebase's Blaze
billing plan — everything else (dashboard actions, Firestore triggers, which Workers can't do) has
no reason to move and stays on Cloud Functions. The Worker reaches the same Firestore over its REST
API, authenticated as a service account (see `worker/README.md`), so both backends read and write
identical tenant data.

## What's built

- **Auth** — email/password and Google sign-in, one organization per merchant, tenant isolation
  enforced in `firestore.rules`.
- **Dashboard** — revenue, orders, pending orders and low-stock at a glance.
- **Inventory** — products with categories, stock tracking, image upload, search and filters.
- **Ordering** — the WhatsApp bot is now a Cloudflare Worker (`worker/`), not a Cloud Function —
  see "Why two backends?" above. It takes an order end-to-end: resolve the merchant from the
  receiving WhatsApp number, show that org's real product catalog, build a cart (add by tapping or
  typing a number/name, edit quantity, remove items), and checkout — which collects a delivery name
  and address, then creates a real order inside one Firestore transaction (sequential order number,
  stock reservation re-checked against a second customer racing for the same item, Pending status).
  Orders land in the dashboard live, same as before. See `worker/README.md`.
- **Delivery** — move an order through Preparing → Out for Delivery → Delivered, with a WhatsApp
  update to the customer at each step, an optional rider assignment, and a delivery timeline on the
  order (every status change, in order, with a timestamp).
- **Inbox** (`/inbox`) — every WhatsApp conversation in one place: unread badges, search, and a
  reply box a merchant can use to message a customer directly (not just the bot) — see
  `functions/src/http/customers.ts`'s `sendReply`.
- **Customers** — built from order history automatically, with repeat-customer stats, notes and
  broadcast promotions.
- **WhatsApp connection** (`/whatsapp`) — connect a number either by pasting credentials from Meta
  Business Suite (works with no extra Meta App setup beyond what "Deploying to production" already
  asks for), or with a one-click "Connect with Facebook" button using Meta's Embedded Signup — the
  latter only appears once `VITE_META_APP_ID`/`VITE_META_CONFIG_ID` are set (see `web/.env.example`),
  since it needs a Meta App configured for that flow. Disconnect and a test-message button included.
- **Analytics** — daily/weekly/monthly revenue and order charts, AOV, returning customers, best
  sellers.
- **Billing** — Free / Starter / Growth / Pro plans (`web/src/config/plans.ts`), usage tracked per
  billing period. Upgrading opens a Paystack checkout (`changePlan` in `functions/src/http/billing.ts`)
  for the plan's price in the merchant's own market currency; `billingWebhook` verifies Paystack's
  signature and only then flips the plan. Renewal is a scheduled function
  (`functions/src/triggers/renewSubscriptions.ts`) that re-charges the card on file every 30 days
  rather than relying on Paystack's own Subscription objects — see that file's comment for why.
  Downgrading to Free (Settings) applies immediately and is also how a merchant cancels — it stops
  future renewal charges. Needs a `PAYSTACK_SECRET_KEY` to actually run; until then, upgrading throws
  a clear "not yet available" rather than pretending to charge anyone. **Untested against a live
  Paystack account** — verify against their current API docs with test-mode keys before relying on
  this for real money.
- **Platform admin** — a separate surface (`/admin`) for OrderFlow staff: platform metrics, suspend
  or delete a merchant, feature flags, an audit log. Gated by a `platformAdmins/{uid}` document, not
  by anything a merchant can grant themselves — see "Tenant model" below.
- **Marketing site** — landing, pricing, FAQ, help center, privacy policy and terms, served from `/`.

## Running it locally

```bash
cd web
cp .env.example .env.local     # fill in from Firebase console → Project settings
npm install
npm run dev
```

`src/utils/env.ts` throws at startup if a key is missing, so a bad `.env.local` fails immediately
with a readable message instead of a confusing Firebase error later.

To run against the emulator suite instead of the live project:

```bash
firebase emulators:start
# then set VITE_USE_FIREBASE_EMULATORS=true in .env.local
```

## Tenant model

```
users/{uid}                     -> { orgId, role }        the link between a person and a tenant
organizations/{orgId}           -> store profile, subscription, whatsapp account
organizations/{orgId}/products
organizations/{orgId}/customers
organizations/{orgId}/orders
platformAdmins/{uid}            -> OrderFlow staff grant — see below
```

Isolation rests on one rule: `users/{uid}.orgId` must equal the `orgId` in the path. Every read and
write in `firestore.rules` goes through `memberOf(orgId)`, and the catch-all at the bottom denies
anything not matched above. The client never builds a Firestore path by hand — `src/firebase/collections.ts`
is the only place paths are constructed, so a query that forgets its tenant will not compile.

Writes that must not be forgeable by a browser are closed off entirely: orders and customers are
`allow write: if false` and are created by Cloud Functions from the WhatsApp webhook. Merchants can
update an order, but the rule limits the change to status, delivery and note fields.

**Platform admin is a separate grant, not a role.** A `platformAdmins/{uid}` document's mere
existence (checked by `isPlatformAdmin()` in the rules) is what makes someone OrderFlow staff — it
has no self-serve path anywhere in the app and must be created out-of-band, e.g. from the Firebase
console or the Admin SDK:

```js
await db.collection('platformAdmins').doc(UID).set({ grantedAt: FieldValue.serverTimestamp() });
```

Cross-tenant reads (platform metrics, the merchant list) always go through a Cloud Function using
the Admin SDK, never a broad Firestore rule — a mistake in a rule can only ever leak one tenant's
data, never every tenant's.

## Folder structure (web/src)

```
components/ui         Button, Input, Select, Card, Badge, Modal, Spinner, EmptyState
components/layout     Sidebar, Topbar, PageHeader, Logo, ThemeToggle
components/routing    ProtectedRoute, PublicOnlyRoute, OnboardingRoute, RequirePlatformAdmin
components/admin      Platform-admin-only components
layouts               MarketingLayout, AuthLayout, DashboardLayout, AdminLayout
pages                 Dashboard + one page per nav item, auth pages under pages/auth,
                       marketing pages under pages/marketing, admin pages under pages/admin
config                plans.ts — the single source of truth for plan pricing and limits
hooks                 useAuth, useTheme, useToast, useCollection, useDocument, useMediaQuery
services              One module per domain — the only place Firestore is written
context               AuthContext (user → profile → org), ThemeContext, ToastContext
types                 Domain models, one file per entity
utils                 env, cn, format, errors, validation (Zod schemas), callWithRetry
firebase              config.ts (SDK init + emulators), collections.ts (typed refs)
```

The rule of thumb: pages render, services talk to Firebase, hooks bridge the two. A component never
imports `firebase/firestore` directly.

`functions/src` mirrors the same idea server-side: `http/` is callables grouped by domain
(`organizations`, `customers`, `billing`, `admin`), `triggers/` reacts to Firestore changes, and
`whatsapp/client.ts` is the only place *these* functions call the Graph API — sending a broadcast, a
test message, or a delivery-status update, none of which is inbound webhook traffic. The inbound
side (webhook + bot) is `worker/src`, a separate deployable — see `worker/README.md`.

## Routing

`/`, `/pricing`, `/faq`, `/help`, `/privacy` and `/terms` are public and unauthenticated — the
marketing site. `/login` and `/signup` redirect a signed-in user straight to `/dashboard` (or
`/admin` for platform staff). Everything under the dashboard layout (`/dashboard`, `/orders`,
`/products`, `/customers`, `/analytics`, `/whatsapp`, `/settings`) requires a signed-in user with a
completed organization; `/admin/*` requires the separate platform-admin grant described above.

## Theming

One token set in `src/index.css`, exposed to Tailwind as semantic names (`canvas`, `surface`,
`raised`, `line`, `ink`, `muted`, `brand`). Dark mode is a `class` on `<html>`, applied by an inline
script in `index.html` before first paint so there is no flash, then kept in sync by `ThemeContext`.
Nothing in the app hardcodes a colour.

## Deploying to production

**Prerequisites:**

- A Firebase project on the **Blaze** (pay-as-you-go) plan — required for Cloud Functions
  (`connectWhatsapp`, billing, admin ops, order-status triggers). The WhatsApp webhook itself no
  longer needs this — it runs on Cloudflare Workers, which has its own free tier.
- A Cloudflare account, for the Worker — see `worker/README.md`.
- A Meta developer account with an app that has the **WhatsApp** product added, used for the
  platform-wide webhook (see `worker/README.md`). Each merchant separately brings their own
  WhatsApp Business phone number — that part needs no setup from you.

**1. Create and point the project at this repo**

```bash
firebase login
firebase projects:create your-project-id   # or use an existing project
```

Update `.firebaserc` to point `default` at your project id.

**2. Enable Firebase products**

In the Firebase console, enable: Authentication (Email/Password and Google providers), Firestore,
Cloud Storage, and Cloud Functions.

**3. Deploy Firestore and Storage rules**

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

**4. Deploy Cloud Functions**

`WHATSAPP_VERIFY_TOKEN` moved to the Worker and isn't needed here. `META_APP_SECRET` is needed again,
though, for a different reason — the Embedded Signup "Connect with Facebook" button
(`exchangeEmbeddedSignupCode`) needs it to complete Meta's OAuth code exchange. Skip this if you're
only using the manual WhatsApp connect form (no Embedded Signup):

```bash
firebase functions:secrets:set META_APP_SECRET   # from your Meta app's Basic Settings
```

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

`META_APP_ID` (not secret — it's also needed client-side, see step 6) goes in `functions/.env` as
`META_APP_ID=your-app-id`, the way Cloud Functions v2 `defineString` params read non-secret config.

**5. Deploy the WhatsApp Worker and configure Meta's webhook**

Full steps (secrets, `wrangler login`, deploy, pointing Meta's webhook at it) are in
`worker/README.md` — do that now. This one Worker serves every merchant on the platform; it looks up
which organization owns an inbound message by the WhatsApp phone number it arrived on, same as the
Cloud Function it replaced did.

**6. Build and deploy the web app**

```bash
cd web
cp .env.example .env.local     # fill in from Firebase console → Project settings, VITE_USE_FIREBASE_EMULATORS=false
npm install
npm run build
cd ..
firebase deploy --only hosting
```

`VITE_META_APP_ID`/`VITE_META_CONFIG_ID` in that same `.env.local` are optional — set both only if
you want the one-click "Connect with Facebook" button on `/whatsapp`; leave them blank and merchants
just get the manual connect form (works either way, no missing feature, just an extra couple of
fields to paste).

**7. Provision your first platform admin**

There is no sign-up flow for this — see "Platform admin is a separate grant" above. Do this once,
from the Firebase console or a one-off Admin SDK script, for whoever runs OrderFlow itself.

**8. Onboard a real merchant**

From here, a merchant signs up through the app like anyone else and connects their own WhatsApp
number from the WhatsApp page — that flow (`connectWhatsapp`/`exchangeEmbeddedSignupCode` in
`functions/src/http/organizations.ts`) verifies their phone number ID and access token against the
Graph API before storing them.

## Demo merchant data

`functions/scripts/seedDemoMerchant.js` seeds a complete, realistic demo organization directly into
Firestore via the Admin SDK — a business ("Ama's Kitchen"), 12 products, 8 customers and ~26 orders
spread over the last 45 days with a realistic status mix, so the dashboard, analytics and delivery
tracking all have real-looking data the moment you log in. It also creates (or resets the password
of) a Firebase Auth user so the demo account is immediately usable.

It creates Firestore and Auth data only — it does not connect a WhatsApp number, since that requires
a real Meta WhatsApp Business Account and cannot be provisioned from a script. Run it, then connect
WhatsApp the same way any merchant would (see step 9 above), if you want the demo to also handle
live messages.

```bash
cd functions
npm install
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json npm run seed:demo
```

Or against the emulator suite:

```bash
firebase emulators:start --only auth,firestore --project demo-orderflow
# in another terminal:
FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
  GCLOUD_PROJECT=demo-orderflow npm --prefix functions run seed:demo
```

The script is safe to re-run — it deletes and rebuilds the demo organization each time rather than
accumulating duplicate data. It prints the login email and password (`demo@orderflow.app` and a
default password, both overridable via `DEMO_EMAIL`/`DEMO_PASSWORD` env vars) when it finishes.

## Going to production

`PRODUCTION_CHECKLIST.md` is the actual step-by-step — accounts needed, deploy order, how to verify
the core loop actually works end-to-end (not just that it deploys), optional integrations, what
monitoring you get for free vs. what needs `VITE_SENTRY_DSN`, and enabling Firestore backups (a GCP
project setting, not something this repo can turn on for you). `docs/admin-guide.md` covers
operating `/admin` once you're live — provisioning staff, suspending a merchant, reading the audit
log.

## What is not built yet

- **Inbound-message rate limiting on the Worker** — the old Cloud Functions bot capped one customer
  to 20 messages/minute; the Cloudflare Worker (`worker/src/bot.ts`) doesn't re-implement this yet,
  since it needs a transaction-backed counter the Firestore-over-REST client doesn't have. Low risk
  at small scale — see `PRODUCTION_CHECKLIST.md`.
- **Card payments in production** — the Paystack flow is fully wired (see "What's built" above) but
  needs a real `PAYSTACK_SECRET_KEY` and has not been exercised against a live or even test-mode
  Paystack account. Treat it as "should work per their docs," not "verified."
- **Server-rendering for the marketing site** — it's a client-rendered SPA route like the rest of
  the app, so search-engine indexing of `/`, `/pricing`, etc. is limited without an SSR layer.
- **Multi-language support** — copy is English-only throughout.
