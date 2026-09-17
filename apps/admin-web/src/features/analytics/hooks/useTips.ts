import { useQuery } from '@tanstack/react-query'
import type { TipsResponse } from '@bonapp/shared-types'
import { apiGet } from '../../../api/client'

export function useTips(from: Date, to: Date) {
  return useQuery<TipsResponse>({
    queryKey: ['analytics', 'tips', from.toISOString(), to.toISOString()],
    queryFn: () =>
      apiGet<TipsResponse>(
        `/api/v1/admin/analytics/tips?from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
  })
}
