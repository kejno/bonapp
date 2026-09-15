import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App() {
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
