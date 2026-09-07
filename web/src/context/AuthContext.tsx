import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { auth, orgRef, userRef } from '@/firebase';
import type { Organization, UserProfile, WithId } from '@/types';

interface AuthContextValue {
  /** Raw Firebase user. Null when signed out. */
  user: User | null;
  /** The /users/{uid} document — carries orgId and role. */
  profile: UserProfile | null;
  /** The tenant this session is scoped to. Every query uses org.id. */
  org: WithId<Organization> | null;
  /** True until the first auth + profile resolution finishes. */
  initialising: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [org, setOrg] = useState<WithId<Organization> | null>(null);
  const [initialising, setInitialising] = useState(true);

  // 1. Track the signed-in Firebase user.
  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next);
    if (!next) {
      setProfile(null);
      setOrg(null);
      setInitialising(false);
    }
  }), []);

  // 2. Follow that user's profile document.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      userRef(user.uid),
      (snap) => {
        setProfile(snap.exists() ? snap.data() : null);
        setInitialising(false);
      },
      () => setInitialising(false),
    );
  }, [user]);

  // 3. Follow the tenant named by the profile.
  useEffect(() => {
    const orgId = profile?.orgId;
    if (!orgId) {
      setOrg(null);
      return;
    }
    return onSnapshot(orgRef(orgId), (snap) => {
      setOrg(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [profile?.orgId]);

  const value = useMemo(
    () => ({ user, profile, org, initialising }),
    [user, profile, org, initialising],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
