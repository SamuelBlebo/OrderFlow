# OrderFlow

A multi-tenant SaaS that lets a small business sell through WhatsApp. Merchants sign up, connect
their WhatsApp Business number and upload items. Customers just message the business — no account,
no app, no website.

This repository holds sprint 1: the foundation. Auth, routing, layout, theming, the tenant model
and the security rules that enforce it.

## Repositories

Per the two-repo decision, this is the **web repo**. A future mobile client lives in its own
repository with its own copy of the Firebase config — nothing is shared through a workspace.

```
orderflow-web/          <- this repo
├── web/                 React (Vite + TypeScript) merchant dashboard
├── functions/           Cloud Functions — WhatsApp webhook, order writes
├── firestore.rules      Tenant isolation
├── storage.rules        Tenant-scoped product images
└── firebase.json        Hosting, emulators, deploy targets
```

## Running it

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
```

Isolation rests on one rule: `users/{uid}.orgId` must equal the `orgId` in the path. Every read and
write in `firestore.rules` goes through `memberOf(orgId)`, and the catch-all at the bottom denies
anything not matched above. The client never builds a Firestore path by hand — `src/firebase/collections.ts`
is the only place paths are constructed, so a query that forgets its tenant will not compile.

Writes that must not be forgeable by a browser are closed off entirely: orders and customers are
`allow write: if false` and are created by Cloud Functions from the WhatsApp webhook. Merchants can
update an order, but the rule limits the change to `status`, `note` and `updatedAt`.

## Folder structure (web/src)

```
components/ui         Button, Input, Select, Card, Badge, Modal, Spinner, EmptyState
components/layout     Sidebar, Topbar, PageHeader, Logo, ThemeToggle
components/routing    ProtectedRoute, PublicOnlyRoute
layouts               DashboardLayout, AuthLayout
pages                 Dashboard + one page per nav item, auth pages under pages/auth
hooks                 useAuth, useTheme, useCollection, useDocument, useMediaQuery
services              One module per domain — the only place Firestore is written
context               AuthContext (user → profile → org), ThemeContext
types                 Domain models, one file per entity
utils                 env, cn, format, errors, validation (Zod schemas)
firebase              config.ts (SDK init + emulators), collections.ts (typed refs)
```

The rule of thumb: pages render, services talk to Firebase, hooks bridge the two. A component never
imports `firebase/firestore` directly.

## Theming

One token set in `src/index.css`, exposed to Tailwind as semantic names (`canvas`, `surface`,
`raised`, `line`, `ink`, `muted`, `brand`). Dark mode is a `class` on `<html>`, applied by an inline
script in `index.html` before first paint so there is no flash, then kept in sync by `ThemeContext`.
Nothing in the app hardcodes a colour.

## What is not built yet

Sprint 1 ships the shell. Orders, Products, Customers, WhatsApp and Settings are placeholder pages
that say which sprint fills them. The webhook function verifies Meta's handshake and acknowledges
POSTs; parsing messages and writing orders is sprint 4.

## Commit

```
git add .
git commit -m "feat: project foundation — vite, tailwind, firebase, routing, layouts, tenant rules"
```
