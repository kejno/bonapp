export interface MenuCategoryDto {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
}

export interface MenuItemDto {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isStopList: boolean;
}
