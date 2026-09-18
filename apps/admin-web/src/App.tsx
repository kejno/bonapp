import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MenuCatalog } from './features/menu/MenuCatalog'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MenuCatalog />
    </QueryClientProvider>
  )
}

export default App
