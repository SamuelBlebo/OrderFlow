# Platform setup — WhatsApp self-service onboarding

**Who this is for**: you, the OrderFlow operator. Once. Not something any
merchant ever sees or does — see `MERCHANT_ONBOARDING.md` for their side of
this, which is just "click Connect WhatsApp."

This is what makes the "Connect WhatsApp" button on `/whatsapp` actually
work. Until it's done, the page shows a calm "not set up yet" message
instead of a broken button — the app still runs fine without this, merchants
just can't self-connect yet.

## Why this exists once, not per-merchant

Meta's Embedded Signup lets *your* Meta App act on behalf of *any* merchant's
WhatsApp Business Account, once that merchant clicks through the popup and
grants permission. You configure the App once; every merchant who connects
afterward uses that same configuration. You never touch a merchant's Meta
account directly, and you never see their credentials — `whatsappConnect.ts`
on the Worker gets a token scoped to that one merchant's number, and that's
what gets stored.

## 1. Create the Meta App

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App** → type **Business**.
2. Add the **WhatsApp** product.
3. Add the **Facebook Login for Business** product (this is what powers Embedded Signup specifically — it's a distinct product from plain "Facebook Login").
4. Note the **App ID** and **App Secret** from **App Settings → Basic** — you'll need both below.

## 2. Configure Embedded Signup

1. **Facebook Login for Business → Configurations → Create configuration**.
2. Choose the template for **WhatsApp Business Embedded Signup** (Meta's wording for this has shifted across UI versions — look for anything mentioning WhatsApp/Embedded Signup specifically, not a generic login configuration).
3. Grant the permissions the flow needs: `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management`.
4. Save it and copy the **Configuration ID** — this is `VITE_META_CONFIGURATION_ID` below.
5. Under **App Settings → Basic → App Domains**, add the domain your web app is actually served from (your Firebase Hosting domain, or a custom domain if you've set one up).

**Note on Business Verification**: Meta requires your Business to be
verified (Meta Business Manager → Business Settings → Security Center)
before real external merchants can complete Embedded Signup in production —
this is a Meta review process that can take from hours to several days and
isn't something this codebase can do for you. You can develop and test with
your own test WhatsApp Business Account before verification finishes.

## 3. Deploy the Cloudflare Worker

Full steps are in `worker/README.md`. In short:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT   # Firebase console → Project settings → Service accounts → Generate new private key
npx wrangler secret put WHATSAPP_VERIFY_TOKEN       # any string you choose
npx wrangler secret put META_APP_SECRET             # from step 1
```

Set `META_APP_ID` in `worker/wrangler.toml`'s `[vars]` (from step 1 — not
secret), confirm `FIREBASE_PROJECT_ID` there matches your Firebase project,
then:

```bash
npm run deploy
```

This prints the Worker's URL — something like
`https://orderflow-whatsapp-worker.<your-subdomain>.workers.dev`. You need
this in two places next.

## 4. Point Meta's webhook at the Worker

In the Meta App's **WhatsApp → Configuration**, set the webhook callback URL
to the Worker URL from step 3, and the verify token to the value you set for
`WHATSAPP_VERIFY_TOKEN`. Subscribe to the `messages` field. This is
platform-wide — every merchant's number that gets connected afterward routes
through this one webhook, resolved by `phone_number_id`.

## 5. Configure the web app

In `web/.env.local` (or wherever your hosting provider injects build-time
env vars):

```
VITE_META_APP_ID=<App ID from step 1>
VITE_META_CONFIGURATION_ID=<Configuration ID from step 2>
VITE_WHATSAPP_WORKER_URL=<Worker URL from step 3>
```

Rebuild and redeploy the web app (`cd web && npm run build`, then
`firebase deploy --only hosting`). Once all three are set, `/whatsapp` shows
the real "Connect WhatsApp" button instead of the "not set up yet" message.

## 6. Test it yourself before a real merchant does

Use your own (or a Meta-provided test) WhatsApp Business Account:

1. Sign in as a merchant, open `/whatsapp`.
2. Click **Connect WhatsApp** → the Facebook Login for Business popup opens.
3. Log in, create/select a Business Portfolio, register/select a number, verify the OTP, grant permissions.
4. The popup closes; the page should show "Connecting…" briefly, then flip to the connected state with the real phone number.
5. Message that WhatsApp number from a phone — you should get a bot reply within a few seconds. That confirms both the Embedded Signup write *and* the webhook subscription (`subscribed_apps`) worked.
6. Click **Test Connection** on the connected card — you should get a WhatsApp message on that same number.

If step 4 hangs at "Connecting…": check `npx wrangler tail` (from `worker/`)
for the actual error — most likely a wrong `META_APP_SECRET`, a
Configuration ID that doesn't match the App ID, or App Domains not
including the origin the popup was opened from.

## What's NOT automated

- **Business Verification** (see step 2) — a Meta review process, not a
  configuration you set once and forget.
- **Rate/usage limits Meta applies to new numbers** — a freshly connected
  number starts with Meta's standard messaging limits regardless of what
  this app does; that's Meta's policy, not something to configure here.
- **This has not been exercised against a live Meta App** — everything above
  follows Meta's documented Embedded Signup flow as of writing. Their
  exact UI labels and the token/response shape have shifted across API
  versions before; verify each step against Meta's current docs as you go
  through this the first time.
