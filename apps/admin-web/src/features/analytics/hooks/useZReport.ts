import { useQuery } from '@tanstack/react-query'
import type { ZReportResponse } from '@bonapp/shared-types'
import { apiGet } from '../../../api/client'

export function useZReport() {
  return useQuery<ZReportResponse>({
    queryKey: ['analytics', 'z-report'],
    queryFn: () => apiGet<ZReportResponse>('/api/v1/admin/analytics/z-report'),
  })
}
