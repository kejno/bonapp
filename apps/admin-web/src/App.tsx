import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">
                <h1 className="text-2xl font-semibold text-bonapp-accent">
                  Bonapp — Admin
                </h1>
              </main>
            }
          />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
