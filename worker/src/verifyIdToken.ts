import { base64urlDecode, base64urlToArrayBuffer } from './base64';

/**
 * Verifies a Firebase Auth ID token with no Admin SDK involved — the
 * standard pattern for edge runtimes (Firebase's own docs describe this
 * exact approach for Cloud Run/edge functions): fetch Google's public keys
 * in JWK form, find the one matching the token's `kid`, and check the RS256
 * signature plus the standard claims (issuer, audience, expiry) by hand.
 * This is what authenticates the merchant calling POST
 * /embedded-signup/exchange — nothing else does, since the Worker has no
 * session/cookie concept of its own.
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

interface GoogleJwk extends JsonWebKey {
  kid: string;
}

interface CachedJwks {
  keys: GoogleJwk[];
  expiresAt: number;
}

let cachedJwks: CachedJwks | null = null;

async function getGoogleJwks(): Promise<GoogleJwk[]> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys;

  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) throw new Error(`Failed to fetch Google's public keys (${response.status})`);
  const body = (await response.json()) as { keys: GoogleJwk[] };

  // Google's Cache-Control header names how long these keys are valid for —
  // respect it instead of a hardcoded TTL, so a key rotation is picked up
  // exactly when Google says it will be, not before or (worse) long after.
  const cacheControl = response.headers.get('cache-control') ?? '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  cachedJwks = { keys: body.keys, expiresAt: Date.now() + maxAgeSeconds * 1000 };
  return cachedJwks.keys;
}

export interface DecodedIdToken {
  uid: string;
  email: string | null;
}

/** Throws with a human-readable reason on any failure — caller turns that into a 401. */
export async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<DecodedIdToken> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64urlDecode(headerB64)) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected token header');

  const keys = await getGoogleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('No matching signing key — Google may have rotated keys since this token was issued');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlToArrayBuffer(signatureB64);
  const validSignature = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData);
  if (!validSignature) throw new Error('Invalid signature');

  const payload = JSON.parse(base64urlDecode(payloadB64)) as {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const CLOCK_SKEW_SECONDS = 60;

  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Wrong issuer');
  if (payload.aud !== projectId) throw new Error('Wrong audience');
  if (!payload.sub) throw new Error('Missing subject');
  if (!payload.exp || payload.exp + CLOCK_SKEW_SECONDS < now) throw new Error('Token expired');
  if (!payload.iat || payload.iat - CLOCK_SKEW_SECONDS > now) throw new Error('Token issued in the future');

  return { uid: payload.sub, email: payload.email ?? null };
}
