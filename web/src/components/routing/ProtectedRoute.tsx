import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { FullPageSpinner } from '@/components/ui';

/** Requires a signed-in user with a tenant. Everything below it can assume org exists. */
export function ProtectedRoute() {
  const { user, org, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!org) return <FullPageSpinner />;

  return <Outlet />;
}

/** Keeps signed-in merchants out of the login and signup screens. */
export function PublicOnlyRoute() {
  const { user, initialising } = useAuth();
  if (initialising) return <FullPageSpinner />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
