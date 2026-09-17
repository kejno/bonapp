import { useQuery } from '@tanstack/react-query'
import type { Granularity, RevenueResponse } from '@bonapp/shared-types'
import { apiGet } from '../../../api/client'

export function useRevenue(from: Date, to: Date, granularity: Granularity) {
  return useQuery<RevenueResponse>({
    queryKey: ['analytics', 'revenue', from.toISOString(), to.toISOString(), granularity],
    queryFn: () =>
      apiGet<RevenueResponse>(
        `/api/v1/admin/analytics/revenue?from=${from.toISOString()}&to=${to.toISOString()}&granularity=${granularity}`,
      ),
  })
}
