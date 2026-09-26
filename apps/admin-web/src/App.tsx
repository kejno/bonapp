import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import MenuEditorPage from './menu/MenuPage';
import MenuPage from './pages/MenuPage';
import OrderPage from './pages/OrderPage';
import TablesPage from './pages/TablesPage';
import OnboardingStep1Page from './pages/OnboardingStep1Page';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/onboarding/step-1" element={<ProtectedRoute><OnboardingStep1Page /></ProtectedRoute>} />
          <Route path="/onboarding/step-2" element={<ProtectedRoute><main className="min-h-screen bg-stone-50 p-10"><div className="mx-auto max-w-2xl rounded-2xl bg-white p-8"><p className="text-sm font-semibold text-orange-700">Настройка заведения · Шаг 2 из 4</p><h1 className="mt-4 text-2xl font-bold">Профиль сохранён</h1><p className="mt-2 text-stone-600">Основные данные заведения сохранены. Продолжите настройку на следующем шаге.</p></div></main></ProtectedRoute>} />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
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
          <Route path="/menu" element={<ProtectedRoute><MenuPage /></ProtectedRoute>} />
          <Route path="/menu/editor" element={<ProtectedRoute><MenuEditorPage /></ProtectedRoute>} />
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
            element={
              <ProtectedRoute>
                <OrderPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
