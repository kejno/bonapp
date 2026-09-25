import type { MenuItem } from './menu-filters';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  isVisible: boolean;
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error('Не удалось выполнить запрос к меню');
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const menuApi = {
  categories: (token: string) => request<MenuCategory[]>('/admin/menu/categories', token),
  items: (token: string) => request<MenuItem[]>('/admin/menu/items', token),
  createItem: (token: string, item: { name: string; categoryId: string; price: number }) =>
    request<MenuItem>('/admin/menu/items', token, { method: 'POST', body: JSON.stringify(item) }),
  updateItem: (token: string, id: string, patch: Partial<Pick<MenuItem, 'isActive'>>) =>
    request<MenuItem>(`/admin/menu/items/${encodeURIComponent(id)}`, token, { method: 'PUT', body: JSON.stringify(patch) }),
  stopList: (token: string, id: string, isInStopList: boolean) =>
    request<MenuItem>(`/admin/menu/items/${encodeURIComponent(id)}/stop-list`, token, { method: 'PATCH', body: JSON.stringify({ isInStopList }) }),
  reorder: (token: string, categoryId: string, itemIds: string[]) =>
    request<void>('/admin/menu/items/reorder', token, { method: 'PATCH', body: JSON.stringify({ categoryId, itemIds }) }),
};
