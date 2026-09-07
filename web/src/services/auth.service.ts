import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, googleProvider, userRef } from '@/firebase';
import { createOrganization } from './org.service';
import type { LoginInput, OnboardingInput, RegisterInput } from '@/utils/validation';

export async function signIn({ email, password }: LoginInput) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/** Creates the tenant and the profile that links a Firebase Auth user to it. */
async function provisionTenant(
  user: User,
  { fullName, businessName, phone }: { fullName: string; businessName: string; phone?: string | null },
) {
  const orgId = await createOrganization({
    name: businessName,
    ownerUid: user.uid,
    phone: phone || null,
  });

  await setDoc(userRef(user.uid), {
    uid: user.uid,
    email: user.email ?? '',
    fullName,
    photoURL: user.photoURL,
    orgId,
    role: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as never);

  return orgId;
}

/**
 * Registration creates three things in order: the auth user, the tenant, and
 * the profile that links them. Cloud Functions will take this over when
 * billing lands; keeping it in one service makes that swap a one-file change.
 */
export async function registerMerchant(input: RegisterInput) {
  const { user } = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await updateProfile(user, { displayName: input.fullName });
  await provisionTenant(user, { fullName: input.fullName, businessName: input.businessName, phone: input.phone });
  return user;
}

/**
 * Google only ever gives us an identity, never a business name, so a
 * first-time Google user lands with a profile-less auth account. The caller
 * (ProtectedRoute) routes them to /onboarding to finish provisioning via
 * completeOnboarding below.
 */
export async function signInWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function completeOnboarding(user: User, input: OnboardingInput) {
  return provisionTenant(user, {
    fullName: user.displayName ?? user.email ?? 'Owner',
    businessName: input.businessName,
    phone: input.phone,
  });
}

export function signOutMerchant() {
  return signOut(auth);
}
