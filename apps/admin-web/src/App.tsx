import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { DishEditDialog } from './features/menu/DishEditDialog'
import type { DishFormValues } from './features/menu/dishSchema'

const queryClient = new QueryClient()

function App() {
  const [editing, setEditing] = useState(false)
  const [dish, setDish] = useState<DishFormValues>({
    name: 'Драники', description: 'Картофельные драники', category: 'Горячие блюда', price: 12,
    cost: 4, imageUrl: '', weight: 250, kitchen: 'HOT', preparationTime: 15, isActive: true,
    isHit: false, calories: undefined, protein: undefined, fat: undefined, carbohydrates: undefined,
    allergens: [], posItemId: '', modifierGroups: [],
  })

  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-svh bg-bonapp-bg p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between"><h1 className="text-2xl font-semibold text-bonapp-accent">Bonapp — Admin</h1><button className="rounded bg-bonapp-accent px-4 py-2 text-white" onClick={() => setEditing(true)}>Редактировать блюдо</button></div>
          <article className="rounded bg-white p-4 shadow-sm"><h2 className="font-semibold">{dish.name}</h2><p>{dish.category} · {dish.price} BYN</p></article>
        </div>
        {editing && <DishEditDialog dishId="dish-1" initialValues={dish} onClose={() => setEditing(false)} onSaved={setDish} />}
      </main>
    </QueryClientProvider>
  )
}

export default App
