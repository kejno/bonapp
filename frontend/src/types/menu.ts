export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
  imageUrl: string | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
}

export interface PublicMenu {
  tenantId: string;
  name: string;
  slug: string;
  categories: MenuCategory[];
}

export interface CartItem {
  item: MenuItem;
  quantity: number;
}
