import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Dashboard } from './pages/Dashboard'

const queryClient = new QueryClient()
const tenantId = import.meta.env.VITE_TENANT_ID ?? 'demo'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard tenantId={tenantId} />
    </QueryClientProvider>
  )
}

export default App
