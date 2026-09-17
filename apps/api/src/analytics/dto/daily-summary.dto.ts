export interface TopDishDto {
  menuItemId: string;
  name: string;
  quantitySold: number;
  totalRevenue: number;
}

export interface DailySummaryDto {
  date: string;
  revenueTotal: number;
  avgCheck: number;
  orderCount: number;
  tableOccupancyPercent: number;
  posPingMs: number | null;
  topDishes: TopDishDto[];
}
