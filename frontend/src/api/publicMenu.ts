import type { PublicMenu } from '../types/menu.ts';

export async function fetchPublicMenu(slug: string, signal?: AbortSignal): Promise<PublicMenu> {
  const res = await fetch(`/public/menu/${encodeURIComponent(slug)}`, { signal });
  if (res.status === 404) throw new Error('not_found');
  if (!res.ok) throw new Error('server_error');
  const data = await res.json() as PublicMenu;
  if (!data || !Array.isArray(data.categories)) throw new Error('server_error');
  return data;
}
