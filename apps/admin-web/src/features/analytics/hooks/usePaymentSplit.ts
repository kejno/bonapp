import { useQuery } from '@tanstack/react-query'
import type { PaymentSplitResponse } from '@bonapp/shared-types'
import { apiGet } from '../../../api/client'

export function usePaymentSplit(from: Date, to: Date) {
  return useQuery<PaymentSplitResponse>({
    queryKey: ['analytics', 'payment-split', from.toISOString(), to.toISOString()],
    queryFn: () =>
      apiGet<PaymentSplitResponse>(
        `/api/v1/admin/analytics/payment-split?from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
  })
}
