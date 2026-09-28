import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import MenuEditorPage from './menu/MenuPage';
import MenuPage from './pages/MenuPage';
import OrderPage from './pages/OrderPage';
import TablesPage from './pages/TablesPage';
import RegisterPage from './pages/RegisterPage';
import OnboardingPage from './pages/OnboardingPage';
import OnboardingStep2Page from './onboarding/OnboardingStep2Page';
import OnboardingStep1Page from './pages/OnboardingStep1Page';
import OnboardingStep3Page from './pages/OnboardingStep3Page';
import OnboardingStep4Page from './pages/OnboardingStep4Page';
import WaiterCallNotifications from './components/WaiterCallNotifications';
import KdsPage from './kds/KdsPage';
import { useAuthStore } from './auth/auth.store';
import type { ReactNode } from 'react';
import StaffPage from './pages/StaffPage';
import SettingsPage from './settings/SettingsPage';
import WelcomePage from './pages/WelcomePage';

const queryClient = new QueryClient();

function KdsRoute() {
  const role = useAuthStore((state) => state.user?.role);
  if (!['CHEF', 'OWNER', 'MANAGER', 'WAITER'].includes(role ?? ''))
    return <Navigate to="/dashboard" replace />;
  return (
    <ProtectedRoute>
      <KdsPage />
    </ProtectedRoute>
  );
}

function NonWaiterRoute({ children }: { children: ReactNode }) {
  const role = useAuthStore((state) => state.user?.role);
  if (role === 'WAITER') return <Navigate to="/dashboard" replace />;
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <WaiterCallNotifications />
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/onboarding/step-1" element={<ProtectedRoute><OnboardingStep1Page /></ProtectedRoute>} />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
          <Route
            path="/onboarding/step-4"
            element={
              <ProtectedRoute>
                <OnboardingStep4Page />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/onboarding/step-2" element={<ProtectedRoute><OnboardingStep2Page /></ProtectedRoute>} />
          <Route
            path="/onboarding/step-3"
            element={
              <ProtectedRoute>
                <OnboardingStep3Page />
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu"
            element={<NonWaiterRoute><MenuPage /></NonWaiterRoute>}
          />
          <Route
            path="/menu/editor"
            element={<NonWaiterRoute><MenuEditorPage /></NonWaiterRoute>}
          />
          <Route path="/kds" element={<KdsRoute />} />
          <Route
            path="/staff"
            element={<NonWaiterRoute><StaffPage /></NonWaiterRoute>}
          />
          <Route
            path="/settings"
            element={<NonWaiterRoute><SettingsPage /></NonWaiterRoute>}
          />
          <Route
            path="/tables"
            element={
              <ProtectedRoute>
                <TablesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId"
            element={<NonWaiterRoute><OrderPage /></NonWaiterRoute>}
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
