import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OnboardingStep4 } from './onboarding/OnboardingStep4'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <span className="sr-only">Bonapp — Admin</span>
      <OnboardingStep4 tenantId={import.meta.env.VITE_TENANT_ID ?? 'current-tenant'} />
    </QueryClientProvider>
  )
}

export default App
