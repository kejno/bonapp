import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OnboardingStep2 } from './OnboardingStep2'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <OnboardingStep2 />
    </QueryClientProvider>
  )
}

export default App
