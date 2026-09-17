export interface RevenueBucketDto {
  bucket: string;
  revenue: number;
  orderCount: number;
}

export type RevenueGranularity = 'hour' | 'day';
