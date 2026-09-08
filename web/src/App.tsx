import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { ProtectedRoute, PublicOnlyRoute, OnboardingRoute, RequirePlatformAdmin } from '@/components/routing/ProtectedRoute';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { FullPageSpinner } from '@/components/ui';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { OnboardingPage } from '@/pages/auth/OnboardingPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { WhatsAppPage } from '@/pages/WhatsAppPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Recharts adds real weight to the bundle — keep it out of the path everyone
// pays for and only load it when a merchant actually opens Analytics.
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));

// The whole platform-admin surface is a separate, low-traffic tool used by
// OrderFlow staff, not merchants — no reason for every merchant's bundle to
// include it.
const AdminLayout = lazy(() => import('@/layouts/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminDashboardPage = lazy(() =>
  import('@/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
);
const AdminMerchantsPage = lazy(() =>
  import('@/pages/admin/AdminMerchantsPage').then((m) => ({ default: m.AdminMerchantsPage })),
);
const AdminLogsPage = lazy(() => import('@/pages/admin/AdminLogsPage').then((m) => ({ default: m.AdminLogsPage })));
const AdminFeatureFlagsPage = lazy(() =>
  import('@/pages/admin/AdminFeatureFlagsPage').then((m) => ({ default: m.AdminFeatureFlagsPage })),
);

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<PublicOnlyRoute />}>
                <Route element={<AuthLayout />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                </Route>
              </Route>

              <Route element={<OnboardingRoute />}>
                <Route element={<AuthLayout />}>
                  <Route path="/onboarding" element={<OnboardingPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute />}>
                <Route element={<DashboardLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route
                    path="/analytics"
                    element={
                      <Suspense fallback={<FullPageSpinner />}>
                        <AnalyticsPage />
                      </Suspense>
                    }
                  />
                  <Route path="/whatsapp" element={<WhatsAppPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>

              <Route element={<RequirePlatformAdmin />}>
                <Route
                  element={
                    <Suspense fallback={<FullPageSpinner />}>
                      <AdminLayout />
                    </Suspense>
                  }
                >
                  <Route path="/admin" element={<AdminDashboardPage />} />
                  <Route path="/admin/merchants" element={<AdminMerchantsPage />} />
                  <Route path="/admin/logs" element={<AdminLogsPage />} />
                  <Route path="/admin/flags" element={<AdminFeatureFlagsPage />} />
                </Route>
              </Route>

              <Route path="/404" element={<NotFoundPage />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
