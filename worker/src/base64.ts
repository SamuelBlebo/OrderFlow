/** Shared base64/base64url helpers — Workers has `atob`/`btoa` but nothing JWT-shaped built on top of them. */

export function base64url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlFromBuffer(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64urlToBase64(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return padded + padding;
}

export function base64urlToArrayBuffer(input: string): ArrayBuffer {
  return base64ToArrayBuffer(base64urlToBase64(input));
}

export function base64urlDecode(input: string): string {
  return atob(base64urlToBase64(input));
}
