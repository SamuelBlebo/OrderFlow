/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
  /** Both optional — the "Connect with Facebook" one-click flow only renders when both are set; otherwise WhatsAppPage falls back to the manual form. */
  readonly VITE_META_APP_ID?: string;
  readonly VITE_META_CONFIG_ID?: string;
  /** Optional — enables Sentry error reporting when set. See utils/monitoring.ts. */
  readonly VITE_SENTRY_DSN?: string;
  /** Optional — enables Firebase Analytics pageview tracking when set. See utils/analyticsTracking.ts. */
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
