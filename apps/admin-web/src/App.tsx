import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastContainer } from './components/ui/Toast'
import { IntegrationsPage } from './features/integrations/IntegrationsPage'

const queryClient = new QueryClient()

const TENANT_ID = (import.meta as any).env?.VITE_TENANT_ID ?? 'default-tenant'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/settings/integrations"
            element={<IntegrationsPage tenantId={TENANT_ID} />}
          />
          <Route path="*" element={<Navigate to="/settings/integrations" replace />} />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
