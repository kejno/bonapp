import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type DragEvent } from 'react'
import {
  fallbackCategories,
  fallbackMenuItems,
  fetchMenuCategories,
  fetchMenuItems,
  filterMenuItems,
  reorderMenuItems,
  updateStopList,
  type MenuFilter,
  type MenuItem,
} from './menu'

const filters: Array<{ id: MenuFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'stop-list', label: 'В стоп-листе' },
  { id: 'inactive', label: 'Неактивные' },
]

const emptyItems: MenuItem[] = []

export function MenuCatalog() {
  const queryClient = useQueryClient()
  const [selectedCategoryId, setSelectedCategoryId] = useState(fallbackCategories[0].id)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<MenuFilter>('all')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const categoriesQuery = useQuery({
    queryKey: ['menu', 'categories'],
    queryFn: fetchMenuCategories,
    initialData: fallbackCategories,
  })
  const itemsQuery = useQuery({
    queryKey: ['menu', 'items', selectedCategoryId],
    queryFn: () => fetchMenuItems(selectedCategoryId),
    initialData: fallbackMenuItems.filter((item) => item.categoryId === selectedCategoryId),
  })
  const items = itemsQuery.data ?? emptyItems
  const canReorder = search.trim() === '' && filter === 'all'
  const visibleItems = useMemo(() => filterMenuItems(items, search, filter), [filter, items, search])

  const stopListMutation = useMutation({
    mutationFn: ({ itemId, isStopListed }: { itemId: string; isStopListed: boolean }) => updateStopList(itemId, isStopListed),
    onMutate: async ({ itemId, isStopListed }) => {
      const queryKey = ['menu', 'items', selectedCategoryId]
      await queryClient.cancelQueries({ queryKey })
      const previousItems = queryClient.getQueryData<MenuItem[]>(queryKey)
      queryClient.setQueryData<MenuItem[]>(queryKey, (current = []) =>
        current.map((item) => item.id === itemId ? { ...item, isStopListed } : item),
      )
      return { previousItems, queryKey }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousItems) queryClient.setQueryData(context.queryKey, context.previousItems)
    },
  })

  const reorderMutation = useMutation({
    mutationFn: reorderMenuItems,
    onMutate: async (itemIds) => {
      const queryKey = ['menu', 'items', selectedCategoryId]
      await queryClient.cancelQueries({ queryKey })
      const previousItems = queryClient.getQueryData<MenuItem[]>(queryKey)
      queryClient.setQueryData<MenuItem[]>(queryKey, (current = []) => itemIds.map((id) => current.find((item) => item.id === id)).filter((item): item is MenuItem => Boolean(item)))
      return { previousItems, queryKey }
    },
    onError: (_error, _itemIds, context) => {
      if (context?.previousItems) queryClient.setQueryData(context.queryKey, context.previousItems)
    },
  })

  function handleDrop(event: DragEvent<HTMLTableRowElement>, targetId: string) {
    event.preventDefault()
    if (!canReorder || !draggedId || draggedId === targetId) return
    const nextItems = [...items]
    const sourceIndex = nextItems.findIndex((item) => item.id === draggedId)
    const targetIndex = nextItems.findIndex((item) => item.id === targetId)
    const [movedItem] = nextItems.splice(sourceIndex, 1)
    nextItems.splice(targetIndex, 0, movedItem)
    setDraggedId(null)
    reorderMutation.mutate(nextItems.map((item) => item.id))
  }

  return <main className="min-h-svh bg-bonapp-bg p-6 text-slate-900">
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="rounded-xl bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-500">КАТЕГОРИИ</p>
        <nav className="space-y-1" aria-label="Категории меню">
          {(categoriesQuery.data ?? fallbackCategories).map((category) => <button key={category.id} onClick={() => setSelectedCategoryId(category.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedCategoryId === category.id ? 'bg-bonapp-accent text-white' : 'hover:bg-slate-100'}`}>
            {category.name}
          </button>)}
        </nav>
      </aside>
      <section className="min-w-0 rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-semibold">Каталог меню</h1><p className="mt-1 text-sm text-slate-500">Управляйте блюдами и их доступностью</p></div>
          <button onClick={() => setIsEditorOpen(true)} className="rounded-lg bg-bonapp-accent px-4 py-2 text-sm font-medium text-white">+ Добавить блюдо</button>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg bg-slate-100 p-1" role="tablist">{filters.map((option) => <button key={option.id} role="tab" aria-selected={filter === option.id} onClick={() => setFilter(option.id)} className={`rounded-md px-3 py-1.5 text-sm ${filter === option.id ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>{option.label}</button>)}</div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию" aria-label="Поиск по названию" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-bonapp-accent" />
        </div>
        {!canReorder && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Чтобы изменить порядок блюд, сбросьте поиск и выберите вкладку «Все»</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="w-10 py-3"></th><th className="py-3">Блюдо</th><th className="py-3">Фото</th><th className="py-3">Цена</th><th className="py-3">Цех</th><th className="py-3">86 Стоп-лист</th><th className="py-3">Статус</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id} draggable={canReorder} onDragStart={() => setDraggedId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, item.id)} className="border-b border-slate-100 last:border-0"><td className="py-4 text-slate-400" aria-label="Перетащить">⠿</td><td className="py-4 font-medium">{item.name}</td><td className="py-4">{item.imageUrl ? <img src={item.imageUrl} alt={`Фото: ${item.name}`} className="h-10 w-10 rounded-md object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-md bg-slate-100 text-xs text-slate-400">Нет</span>}</td><td className="py-4">{item.price.toFixed(2)} BYN</td><td className="py-4 text-slate-600">{item.kitchen}</td><td className="py-4"><button role="switch" aria-checked={item.isStopListed} disabled={!item.isActive || stopListMutation.isPending} onClick={() => stopListMutation.mutate({ itemId: item.id, isStopListed: !item.isStopListed })} className={`relative h-6 w-11 rounded-full ${item.isStopListed ? 'bg-bonapp-accent' : 'bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${item.isStopListed ? 'translate-x-6' : 'translate-x-1'}`} /></button></td><td className="py-4"><span className={`rounded-full px-2 py-1 text-xs ${item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.isActive ? 'Активно' : 'Неактивно'}</span></td></tr>)}</tbody></table></div>
        {visibleItems.length === 0 && <p className="py-8 text-center text-slate-500">Блюда не найдены</p>}
      </section>
    </div>
    {isEditorOpen && <div role="dialog" aria-modal="true" aria-label="Редактирование блюда" className="fixed inset-0 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Новое блюдо</h2><button onClick={() => setIsEditorOpen(false)} aria-label="Закрыть">×</button></div><p className="mt-3 text-sm text-slate-600">Заполните данные блюда в форме редактирования.</p><button onClick={() => setIsEditorOpen(false)} className="mt-6 rounded-lg border border-slate-200 px-4 py-2 text-sm">Закрыть</button></div></div>}
  </main>
}
