# OrderFlow

A multi-tenant SaaS that lets a small business sell through WhatsApp. Merchants sign up, connect
their WhatsApp Business number and upload products. Customers just message the business — no
account, no app, no website — and OrderFlow's Cloud Functions run the chat, create the order and
keep stock in step.

## Repositories

Per the two-repo decision, this is the **web repo**. A future mobile client lives in its own
repository with its own copy of the Firebase config — nothing is shared through a workspace.

```
orderflow-web/          <- this repo
├── web/                 React (Vite + TypeScript) marketing site + merchant dashboard + platform admin
├── functions/           Cloud Functions — WhatsApp webhook, order writes, billing, admin ops
├── firestore.rules      Tenant isolation
├── firestore.indexes.json
├── storage.rules        Tenant-scoped product images
└── firebase.json        Hosting, emulators, deploy targets
```

## What's built

- **Auth** — email/password and Google sign-in, one organization per merchant, tenant isolation
  enforced in `firestore.rules`.
- **Dashboard** — revenue, orders, pending orders and low-stock at a glance.
- **Inventory** — products with categories, stock tracking, image upload, search and filters.
- **Ordering** — the WhatsApp bot (`functions/src/bot/engine.ts`) takes an order end-to-end: browse,
  pick a quantity, give an address, confirm. Orders land in the dashboard live.
- **Delivery** — move an order through Preparing → Out for Delivery → Delivered, with a WhatsApp
  update to the customer at each step, and an optional rider assignment.
- **Customers** — built from order history automatically, with repeat-customer stats, notes and
  broadcast promotions.
- **Analytics** — daily/weekly/monthly revenue and order charts, AOV, returning customers, best
  sellers.
- **Billing** — Free / Starter / Growth / Pro plans (`web/src/config/plans.ts`), usage tracked per
  billing period; Stripe/Paystack wiring is prepared (secret names reserved in
  `functions/src/config.ts`) but not live — upgrading throws until real keys are provisioned.
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

`functions/src` mirrors the same idea server-side: `bot/` is the WhatsApp state machine, `http/` is
callables grouped by domain (`organizations`, `customers`, `billing`, `admin`), `triggers/` reacts to
Firestore changes, and `whatsapp/client.ts` is the only place that calls the Graph API.

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

- A Firebase project on the **Blaze** (pay-as-you-go) plan — required for Cloud Functions to make
  outbound calls to the WhatsApp Graph API.
- A Meta developer account with an app that has the **WhatsApp** product added, used for the
  platform-wide webhook (see below). Each merchant separately brings their own WhatsApp Business
  phone number — that part needs no setup from you.

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

**4. Set the two platform-level secrets Cloud Functions need**

These belong to the platform, not to any one merchant — merchants never see them.

```bash
firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN   # any string you choose — Meta echoes it back once
firebase functions:secrets:set META_APP_SECRET         # from your Meta app's dashboard, used to verify webhook signatures
```

**5. Deploy Cloud Functions**

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

The deploy output prints the HTTPS trigger URL for `whatsappWebhook` — copy it, you'll need it next.
It looks like `https://REGION-PROJECT_ID.cloudfunctions.net/whatsappWebhook` (region is
`europe-west1`, set in `functions/src/config.ts`).

**6. Configure the Meta app's webhook (one-time, platform-wide)**

In your Meta app's WhatsApp product settings, set the webhook callback URL to the `whatsappWebhook`
URL from step 5, and the verify token to the value you set in step 4. Subscribe to the `messages`
field. This one webhook serves every merchant on the platform — the function looks up which
organization owns an inbound message by the WhatsApp phone number it arrived on.

**7. Build and deploy the web app**

```bash
cd web
cp .env.example .env.local     # fill in from Firebase console → Project settings, VITE_USE_FIREBASE_EMULATORS=false
npm install
npm run build
cd ..
firebase deploy --only hosting
```

**8. Provision your first platform admin**

There is no sign-up flow for this — see "Platform admin is a separate grant" above. Do this once,
from the Firebase console or a one-off Admin SDK script, for whoever runs OrderFlow itself.

**9. Onboard a real merchant**

From here, a merchant signs up through the app like anyone else and connects their own WhatsApp
number from Settings — that flow (`connectWhatsapp` in `functions/src/http/organizations.ts`)
verifies their phone number ID and access token against the Graph API before storing them.

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

## What is not built yet

- **Card payments** — Stripe/Paystack secret names are reserved and `changePlan` is wired to expect
  them, but no real payment provider is connected. Upgrading to a paid plan throws a clear
  "not yet available" error rather than silently failing; downgrading to Free always works.
- **Server-rendering for the marketing site** — it's a client-rendered SPA route like the rest of
  the app, so search-engine indexing of `/`, `/pricing`, etc. is limited without an SSR layer.
- **Multi-language support** — copy is English-only throughout.
