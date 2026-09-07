import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, userRef } from '@/firebase';
import { createOrganization } from './org.service';
import type { LoginInput, RegisterInput } from '@/utils/validation';

export async function signIn({ email, password }: LoginInput) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/**
 * Registration creates three things in order: the auth user, the tenant, and
 * the profile that links them. Cloud Functions will take this over when
 * billing lands; keeping it in one service makes that swap a one-file change.
 */
export async function registerMerchant(input: RegisterInput) {
  const { user } = await createUserWithEmailAndPassword(auth, input.email, input.password);
  await updateProfile(user, { displayName: input.fullName });

  const orgId = await createOrganization({
    name: input.businessName,
    ownerUid: user.uid,
  });

  await setDoc(userRef(user.uid), {
    uid: user.uid,
    email: input.email,
    fullName: input.fullName,
    photoURL: null,
    orgId,
    role: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as never);

  return user;
}

export function signOutMerchant() {
  return signOut(auth);
}
