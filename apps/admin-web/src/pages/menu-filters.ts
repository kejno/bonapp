export interface MenuItem {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  imageUrl: string | null;
  kitchenDepartment: string | null;
  isActive: boolean;
  isInStopList: boolean;
  sortOrder?: number;
}

export type MenuTab = 'all' | 'stop-list' | 'inactive';

export function filterMenuItems(
  items: MenuItem[],
  filters: { categoryId: string; query: string; tab: MenuTab },
): MenuItem[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return items.filter((item) =>
    (filters.categoryId === 'all' || item.categoryId === filters.categoryId) &&
    (!query || item.name.toLocaleLowerCase().includes(query)) &&
    (filters.tab === 'all' ||
      (filters.tab === 'stop-list' && item.isInStopList) ||
      (filters.tab === 'inactive' && !item.isActive)),
  );
}
