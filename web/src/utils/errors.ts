const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'That email and password do not match an account.',
  'auth/user-not-found': 'No account uses that email.',
  'auth/wrong-password': 'That password is not right.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/weak-password': 'Choose a password with at least 8 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute, then try again.',
  'permission-denied': 'This data belongs to another business.',
};

/** Turns a thrown Firebase error into something a merchant can act on. */
export function toMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: string }).code);
    if (MESSAGES[code]) return MESSAGES[code];
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}
