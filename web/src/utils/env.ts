/**
 * Reads environment variables once, at startup, so a missing key fails loudly
 * here instead of surfacing later as a confusing Firebase error.
 */
function required(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(
      `Missing environment variable ${key}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return String(value);
}

export const env = {
  firebase: {
    apiKey: required('VITE_FIREBASE_API_KEY'),
    authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: required('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: required('VITE_FIREBASE_APP_ID'),
  },
  useEmulators: import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true',
} as const;
