import type { ShiftDto, CloseShiftResultDto, OpenShiftRequest } from '@bonapp/shared-types'
import { apiFetch } from './client'

export const shiftsApi = {
  getCurrent: () => apiFetch<ShiftDto | null>('/shifts/current'),

  open: (data: OpenShiftRequest) =>
    apiFetch<ShiftDto>('/shifts/open', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  close: (id: string) =>
    apiFetch<CloseShiftResultDto>(`/shifts/${id}/close`, { method: 'POST' }),
}
