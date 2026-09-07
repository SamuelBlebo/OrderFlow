import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { FullPageSpinner } from '@/components/ui';

/** Requires a signed-in user with a tenant. Everything below it can assume org exists. */
export function ProtectedRoute() {
  const { user, profile, org, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Google sign-in never collects a business name, so a first-time Google
  // user is signed in but has no /users profile yet — send them to finish setup.
  if (!profile) return <Navigate to="/onboarding" replace />;
  if (!org) return <FullPageSpinner />;

  return <Outlet />;
}

/** Keeps signed-in merchants out of the login and signup screens. */
export function PublicOnlyRoute() {
  const { user, profile, initialising } = useAuth();
  if (initialising) return <FullPageSpinner />;
  if (user && !profile) return <Navigate to="/onboarding" replace />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Signed in but hasn't finished tenant setup yet (mid-Google-onboarding). */
export function OnboardingRoute() {
  const { user, profile, initialising } = useAuth();
  if (initialising) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile) return <Navigate to="/" replace />;
  return <Outlet />;
}
