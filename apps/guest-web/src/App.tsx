import { useState } from 'react'
import { useCartStore } from './features/cart/cart-store'
import { DishBottomSheet } from './features/menu/DishBottomSheet'
import { menuItems } from './features/menu/menu-data'

function App() {
  const [selectedItem, setSelectedItem] = useState<(typeof menuItems)[number] | null>(null)
  const cartQuantity = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0))

  const openItem = (item: (typeof menuItems)[number]) => {
    window.history.pushState({ dishSheet: true }, '')
    setSelectedItem(item)
  }

  return (
    <main className="min-h-svh bg-bonapp-bg px-4 py-6 text-stone-900">
      <header className="mb-6 flex items-center justify-between">
        <div><p className="text-sm text-stone-500">Ваш стол</p><h1 className="text-2xl font-bold">Меню</h1></div>
        <span aria-label="Корзина" className="rounded-full bg-bonapp-accent px-3 py-2 text-sm font-bold text-white">{cartQuantity}</span>
      </header>
      <section className="grid gap-4" aria-label="Блюда">
        {menuItems.map((item) => (
          <button className="overflow-hidden rounded-2xl bg-white text-left shadow-sm" key={item.id} onClick={() => openItem(item)} type="button">
            <img alt="" className="h-40 w-full object-cover" src={item.imageUrl} />
            <span className="block p-4"><span className="block text-lg font-semibold">{item.name}</span><span className="mt-1 block text-sm text-stone-500">от {item.basePrice.toFixed(2)} BYN</span></span>
          </button>
        ))}
      </section>
      {selectedItem && <DishBottomSheet item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </main>
  )
}

export default App
