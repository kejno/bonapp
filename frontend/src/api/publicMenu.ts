import type { PublicMenu } from '../types/menu.ts';

export async function fetchPublicMenu(slug: string): Promise<PublicMenu> {
  const res = await fetch(`/public/menu/${slug}`);
  if (!res.ok) throw new Error('Venue not found');
  return res.json() as Promise<PublicMenu>;
}
