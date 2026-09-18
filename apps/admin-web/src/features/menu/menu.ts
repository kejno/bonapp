export type MenuFilter = 'all' | 'stop-list' | 'inactive'

export interface MenuItem {
  id: string
  categoryId: string
  name: string
  price: number
  kitchen: string
  isActive: boolean
  isStopListed: boolean
  imageUrl: string
}

export interface MenuCategory {
  id: string
  name: string
}

export const fallbackCategories: MenuCategory[] = [
  { id: 'starters', name: 'Закуски' },
  { id: 'hot', name: 'Горячие блюда' },
  { id: 'desserts', name: 'Десерты' },
]

export const fallbackMenuItems: MenuItem[] = [
  { id: 'bruschetta', categoryId: 'starters', name: 'Брускетта с томатами', price: 14, kitchen: 'Холодный цех', isActive: true, isStopListed: false, imageUrl: '' },
  { id: 'caesar', categoryId: 'starters', name: 'Цезарь с курицей', price: 19, kitchen: 'Холодный цех', isActive: true, isStopListed: true, imageUrl: '' },
  { id: 'borscht', categoryId: 'hot', name: 'Борщ с говядиной', price: 15, kitchen: 'Горячий цех', isActive: true, isStopListed: false, imageUrl: '' },
  { id: 'steak', categoryId: 'hot', name: 'Стейк из говядины', price: 38, kitchen: 'Гриль', isActive: true, isStopListed: true, imageUrl: '' },
  { id: 'pavlova', categoryId: 'desserts', name: 'Павлова', price: 16, kitchen: 'Кондитерский цех', isActive: false, isStopListed: true, imageUrl: '' },
]

export function filterMenuItems(
  items: MenuItem[],
  search: string,
  filter: MenuFilter,
): MenuItem[] {
  const normalizedSearch = search.trim().toLocaleLowerCase()

  return items.filter((item) => {
    const matchesSearch = item.name.toLocaleLowerCase().includes(normalizedSearch)
    const matchesFilter =
      filter === 'all' ||
      (filter === 'stop-list' && item.isStopListed) ||
      (filter === 'inactive' && !item.isActive)

    return matchesSearch && matchesFilter
  })
}

export async function fetchMenuCategories(): Promise<MenuCategory[]> {
  const response = await fetch('/api/v1/admin/menu/categories')
  if (!response.ok) throw new Error('Не удалось загрузить категории')
  return response.json() as Promise<MenuCategory[]>
}

export async function fetchMenuItems(categoryId: string): Promise<MenuItem[]> {
  const response = await fetch(`/api/v1/admin/menu/categories/${categoryId}/items`)
  if (!response.ok) throw new Error('Не удалось загрузить блюда')
  return response.json() as Promise<MenuItem[]>
}

export async function updateStopList(itemId: string, isStopListed: boolean): Promise<void> {
  const response = await fetch(`/api/v1/admin/menu/items/${itemId}/stop-list`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isStopListed }),
  })
  if (!response.ok) throw new Error('Не удалось обновить стоп-лист')
}

export async function reorderMenuItems(itemIds: string[]): Promise<void> {
  const response = await fetch('/api/v1/admin/menu/items/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemIds }),
  })
  if (!response.ok) throw new Error('Не удалось изменить порядок блюд')
}
