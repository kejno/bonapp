import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SuperAdminPage } from './pages/superadmin/SuperAdminPage';
import { useAuthStore } from './stores/authStore';

const queryClient = new QueryClient();

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.role);
  if (role !== 'SUPER_ADMIN') return <Navigate to="/403" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/superadmin"
            element={
              <RequireSuperAdmin>
                <SuperAdminPage />
              </RequireSuperAdmin>
            }
          />
          <Route
            path="/403"
            element={
              <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">
                <p className="text-lg text-gray-600">403 — Доступ запрещён</p>
              </main>
            }
          />
          <Route
            path="*"
            element={
              <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">
                <h1 className="text-2xl font-semibold text-bonapp-accent">Bonapp — Admin</h1>
              </main>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
