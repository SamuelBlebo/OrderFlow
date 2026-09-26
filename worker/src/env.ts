/**
 * Everything the Worker reads from `wrangler.toml`'s [vars] or from
 * `wrangler secret put` — Cloudflare exposes both the same way, as plain
 * properties on `env`, so there is no code-level distinction between them.
 */
export interface Env {
  FIREBASE_PROJECT_ID: string;
  GRAPH_VERSION: string;
  /** The full service-account JSON key, as one string — see wrangler.toml. */
  FIREBASE_SERVICE_ACCOUNT: string;
  WHATSAPP_VERIFY_TOKEN: string;
  META_APP_SECRET: string;
  /** Not secret — used as the Embedded Signup OAuth exchange's client_id (see whatsappConnect.ts). Same id the web app's FB SDK uses. */
  META_APP_ID: string;
}
