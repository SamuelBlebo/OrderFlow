import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ProtectedRoute, PublicOnlyRoute, OnboardingRoute } from '@/components/routing/ProtectedRoute';
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

export default function App() {
  return (
    <ThemeProvider>
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

            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
