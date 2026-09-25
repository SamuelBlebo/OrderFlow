# OrderFlow WhatsApp Worker

The WhatsApp webhook and bot, as a Cloudflare Worker — no Firebase Cloud
Functions, no Blaze plan required. This is the **only** thing that answers
Meta's traffic; the old Firebase Functions webhook (`functions/src/whatsapp/webhook.ts`,
`functions/src/bot/engine.ts`) has been removed. Everything else
(`connectWhatsapp`, `changePlan`, `sendBroadcast`, order-status triggers,
platform admin) stays on Firebase Functions — Workers have no Firestore
trigger equivalent, and those are dashboard-facing, not webhook traffic.

## Why a Worker needs its own Firestore client

`firebase-admin` doesn't run on Workers (no Node.js runtime, no native
bindings). This Worker talks to Firestore over its **REST API** instead
(`src/firestore.ts`), authenticating with a signed JWT built from a service
account key (`src/firestoreAuth.ts`, using Web Crypto — no `node:crypto`
either). Google treats this exactly like the Admin SDK: it bypasses
`firestore.rules` entirely, so multi-tenant isolation is enforced the same
way it always was — by which `orgId` this code chooses to read and write,
not by a client-side rule.

## What's built so far

**Sprint 1** — on every inbound WhatsApp message: resolve the merchant from
the receiving `phone_number_id` (`whatsappAccounts/{phoneNumberId}`), create
the customer if this phone hasn't messaged before, log the message, and
reply with that org's live product catalog read straight from Firestore — no
hardcoded menu, no demo data.

**Sprint 2** — a real cart on top of that: `organizations/{orgId}/sessions/{waId}`
holds one persistent cart + conversation state per customer per merchant (the
same collection and doc-id convention the old Cloud Functions bot used, so
the existing `cleanupSessions` scheduled function still purges stale ones).
A customer can add a product by tapping a list row **or** just typing its
number or name, edit quantity (`qty <item#> <amount>`), remove an item
(`remove <item#>`), view the cart (`cart`), and run `checkout`, which
collects a delivery name and address and ends at a confirm/cancel prompt.

**Sprint 3** — confirming that prompt creates a real order. `src/orders.ts`
runs one Firestore **transaction** over the REST API (`beginTransaction` ->
`batchGet` -> `commit` — `firebase-admin`'s `runTransaction` isn't available
outside Node) that atomically: assigns the next sequential order number,
re-checks stock against what the transaction actually sees (not the numbers
the conversation collected earlier — two customers racing for the last item
can't both win), writes the order + its `orderItems`, decrements product
stock, and updates the customer's order count and lifetime spend. Status
starts `pending`, same field the merchant dashboard already renders — no
dashboard changes needed, since this writes the exact schema it already
reads. The customer gets a real order number back in their confirmation
message.

## One-time setup

**1. Install dependencies**

```bash
cd worker
npm install
```

**2. Log in to Cloudflare**

```bash
npx wrangler login
```

**3. Get a Firebase service-account key**

Firebase console → Project settings → Service accounts → **Generate new
private key**. This downloads a JSON file — the Worker needs its content
(not the file itself) as a secret. This key needs at least the
**Cloud Datastore User** IAM role on the project (a Firebase service account
already has this by default).

**4. Set secrets** (never put these in `wrangler.toml` or commit them)

```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
# paste the ENTIRE contents of the downloaded JSON file as one line, then Enter

npx wrangler secret put WHATSAPP_VERIFY_TOKEN
# any string you choose — Meta echoes it back once, during webhook setup

npx wrangler secret put META_APP_SECRET
# from your Meta app's Basic Settings
```

**5. Check `FIREBASE_PROJECT_ID` in `wrangler.toml`** matches your actual
Firebase project id (defaults to `orderflow-001`).

**6. Deploy**

```bash
npm run deploy
```

This prints the Worker's URL, e.g. `https://orderflow-whatsapp-worker.<your-subdomain>.workers.dev`.

**7. Point Meta's webhook at it**

In your Meta app's WhatsApp product settings, set the webhook callback URL to
that Worker URL, and the verify token to the value from step 4. Subscribe to
the `messages` field.

## Local development

```bash
npm run dev
```

`wrangler dev` reads secrets from a local `.dev.vars` file (gitignored) if
one exists — same keys as above, `KEY=value` per line — so you can test
against real Firestore data without deploying:

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
WHATSAPP_VERIFY_TOKEN=dev-token
META_APP_SECRET=...
```

`npm run tail` streams live logs from the deployed Worker (`console.log`/`console.error`
calls in the code above show up here — there is no Cloud Functions log viewer
for this piece anymore).

## Project layout

```
src/
  index.ts          fetch handler — GET verification, POST webhook, signature check
  env.ts             Env type for wrangler.toml vars + secrets
  signature.ts        X-Hub-Signature-256 check (Web Crypto HMAC)
  firestoreAuth.ts      service-account JWT signing + Google OAuth2 token exchange
  firestore.ts            REST client: getDoc, setDoc, queryCollection + value converters
  tenant.ts                 loadWhatsappAccount, loadOrgProfile — same schema as functions/src/tenant.ts
  catalog.ts                  active products, single-product lookup, name search
  customers.ts                 find-or-create customer by WhatsApp id, saved name lookup
  messages.ts                   logs every inbound message
  sessions.ts                    load/save the per-customer cart + conversation state
  cart.ts                         merge/remove/set-quantity + cart total/summary formatting
  orders.ts                        placeOrder — the transaction that turns checkout into a real order
  whatsapp.ts                       send/list/buttons/markAsRead — same payloads as functions/src/whatsapp/client.ts
  bot.ts                             routing: catalog, cart management, checkout, order confirmation
```
