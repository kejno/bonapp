import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { KdsScreen } from './kds/KdsScreen'

const queryClient = new QueryClient()

function App() {
  if (window.location.pathname === '/kds') {
    return (
      <QueryClientProvider client={queryClient}>
        <KdsScreen />
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">
        <h1 className="text-2xl font-semibold text-bonapp-accent">
          Bonapp — Admin
        </h1>
      </main>
    </QueryClientProvider>
  )
}

export default App
