import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useMemo, useState } from 'react';
import { useAuthStore } from '../auth/auth.store';
import { filterMenuItems, type MenuItem, type MenuTab } from './menu-filters';
import { menuApi } from './menu-api';

const key = ['menu-catalog'];

export default function MenuPage() {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<MenuTab>('all');
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const categoriesQuery = useQuery({ queryKey: [...key, 'categories'], queryFn: () => menuApi.categories(token!), enabled: Boolean(token) });
  const itemsQuery = useQuery({ queryKey: [...key, 'items'], queryFn: () => menuApi.items(token!), enabled: Boolean(token) });

  const stopListMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => menuApi.stopList(token!, id, value),
    onMutate: async ({ id, value }) => {
      await queryClient.cancelQueries({ queryKey: [...key, 'items'] });
      const previous = queryClient.getQueryData<MenuItem[]>([...key, 'items']);
      queryClient.setQueryData<MenuItem[]>([...key, 'items'], (items = []) => items.map((item) => item.id === id ? { ...item, isInStopList: value } : item));
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData([...key, 'items'], context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...key, 'items'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: ({ category, ids }: { category: string; ids: string[] }) => menuApi.reorder(token!, category, ids),
    onMutate: async ({ category, ids }) => {
      await queryClient.cancelQueries({ queryKey: [...key, 'items'] });
      const previous = queryClient.getQueryData<MenuItem[]>([...key, 'items']);
      const rank = new Map(ids.map((id, index) => [id, index]));
      queryClient.setQueryData<MenuItem[]>([...key, 'items'], (items = []) => items.map((item) => item.categoryId === category ? { ...item, sortOrder: rank.get(item.id) ?? Number.MAX_SAFE_INTEGER } : item).sort((a, b) => (a.categoryId === b.categoryId ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0) : 0)));
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData([...key, 'items'], context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...key, 'items'] }),
  });

  const createMutation = useMutation({
    mutationFn: (item: { name: string; categoryId: string; price: number }) => menuApi.createItem(token!, item),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: [...key, 'items'] }); setCreateOpen(false); },
  });

  const categories = categoriesQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const filteredItems = useMemo(() => filterMenuItems(items, { categoryId, query, tab }), [items, categoryId, query, tab]);
  const canReorder = !query.trim() && tab === 'all' && categoryId !== 'all';

  function reorderItems(targetId: string) {
    if (!canReorder || !draggedId || draggedId === targetId) return;
    const inCategory = items.filter((item) => item.categoryId === categoryId);
    const from = inCategory.findIndex((item) => item.id === draggedId);
    const to = inCategory.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...inCategory];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    reorderMutation.mutate({ category: categoryId, ids: reordered.map((item) => item.id) });
    setDraggedId(null);
  }

  return (
    <main className="min-h-svh bg-background text-on-background">
      <header className="flex h-16 items-center justify-between border-b border-outline-variant/40 bg-surface-card px-8">
        <div className="font-semibold">Bonapp <span className="ml-2 text-on-background/50">/ Каталог меню</span></div>
        <button className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary" onClick={() => setCreateOpen(true)}>+ Добавить блюдо</button>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-8 py-8">
        <aside className="w-56 shrink-0">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-on-background/50">Категории</h2>
          <button onClick={() => setCategoryId('all')} className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${categoryId === 'all' ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-surface-card'}`}>Все категории</button>
          {categories.map((category) => <button key={category.id} onClick={() => setCategoryId(category.id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${categoryId === category.id ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-surface-card'}`}>{category.name}</button>)}
        </aside>
        <section className="min-w-0 flex-1">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">Блюда</h1>
            <input aria-label="Поиск по названию" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию" className="w-72 rounded-lg border border-outline-variant bg-surface-card px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div className="mb-4 flex gap-2" role="tablist" aria-label="Фильтр блюд">
            {([['all', 'Все'], ['stop-list', 'В стоп-листе'], ['inactive', 'Неактивные']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-full px-4 py-2 text-sm ${tab === value ? 'bg-on-background text-background' : 'bg-surface-card text-on-background/70'}`}>{label}</button>)}
          </div>
          {!canReorder && <p className="mb-3 text-xs text-on-background/55">Чтобы изменить порядок блюд, сбросьте поиск и выберите вкладку «Все» в категории.</p>}
          {(categoriesQuery.isError || itemsQuery.isError) && <p role="alert" className="mb-3 text-sm text-error">Не удалось загрузить каталог. Обновите страницу и попробуйте ещё раз.</p>}
          <div className="overflow-hidden rounded-xl border border-outline-variant/50 bg-surface-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-background/70 text-xs uppercase text-on-background/55"><tr><th className="w-10 px-4 py-3" aria-label="Порядок"/><th className="px-4 py-3">Блюдо</th><th className="px-4 py-3">Цена</th><th className="px-4 py-3">Цех</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">86 Стоп-лист</th></tr></thead>
              <tbody className="divide-y divide-outline-variant/30">
                {filteredItems.map((item) => <tr key={item.id} draggable={canReorder} onDragStart={() => setDraggedId(item.id)} onDragOver={(event) => { if (canReorder) event.preventDefault(); }} onDrop={() => reorderItems(item.id)} className={draggedId === item.id ? 'opacity-40' : ''}>
                  <td className="px-4 py-3 text-on-background/40" aria-label={canReorder ? 'Перетащить для сортировки' : undefined}>{canReorder ? '⠿' : ''}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="h-10 w-10 overflow-hidden rounded-lg bg-background">{item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}</div><span className="font-medium">{item.name}</span></div></td>
                  <td className="px-4 py-3">{(item.price / 100).toFixed(2)} BYN</td><td className="px-4 py-3 text-on-background/65">{item.kitchenDepartment ?? '—'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs ${item.isActive ? 'bg-success-container text-on-success-container' : 'bg-background text-on-background/60'}`}>{item.isActive ? 'Активно' : 'Неактивно'}</span></td>
                  <td className="px-4 py-3"><button type="button" role="switch" aria-label={`86 Стоп-лист: ${item.name}`} aria-checked={item.isInStopList} disabled={!item.isActive || stopListMutation.isPending} onClick={() => stopListMutation.mutate({ id: item.id, value: !item.isInStopList })} className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${item.isInStopList ? 'bg-primary' : 'bg-outline-variant'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${item.isInStopList ? 'translate-x-6' : 'translate-x-1'}`} /></button></td>
                </tr>)}
                {itemsQuery.isLoading && <tr><td colSpan={6} className="px-4 py-12 text-center text-on-background/55">Загрузка меню…</td></tr>}
                {!itemsQuery.isLoading && filteredItems.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-on-background/55">Блюда не найдены</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {isCreateOpen && <CreateItemDialog categories={categories} busy={createMutation.isPending} onClose={() => setCreateOpen(false)} onSubmit={(item) => createMutation.mutate(item)} error={createMutation.isError ? 'Не удалось добавить блюдо. Проверьте данные и повторите попытку.' : ''} />}
    </main>
  );
}

function CreateItemDialog({ categories, busy, error, onClose, onSubmit }: { categories: { id: string; name: string }[]; busy: boolean; error: string; onClose: () => void; onSubmit: (item: { name: string; categoryId: string; price: number }) => void }) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [price, setPrice] = useState('');
  function submit(event: FormEvent) { event.preventDefault(); const amount = Number(price.replace(',', '.')); if (name.trim() && categoryId && Number.isFinite(amount) && amount >= 0) onSubmit({ name: name.trim(), categoryId, price: Math.round(amount * 100) }); }
  return <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="create-title" className="w-full max-w-lg rounded-xl bg-surface-card p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 id="create-title" className="text-lg font-semibold">Новое блюдо</h2><button aria-label="Закрыть" onClick={onClose}>×</button></div><form onSubmit={submit} className="space-y-4"><label className="block text-sm">Название<input required autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label><label className="block text-sm">Категория<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 block w-full rounded-lg border border-outline-variant bg-surface px-3 py-2">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="block text-sm">Цена, BYN<input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 block w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-error">{error}</p>}<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">Отмена</button><button disabled={busy || categories.length === 0} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">{busy ? 'Сохраняем…' : 'Добавить блюдо'}</button></div></form></section></div>;
}
