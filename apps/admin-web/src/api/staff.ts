import type { StaffMemberDto, CreateStaffRequest, UpdateStaffRequest } from '@bonapp/shared-types'
import { apiFetch } from './client'

export const staffApi = {
  getAll: () => apiFetch<StaffMemberDto[]>('/staff'),

  create: (data: CreateStaffRequest) =>
    apiFetch<StaffMemberDto>('/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateStaffRequest) =>
    apiFetch<StaffMemberDto>(`/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deactivate: (id: string) =>
    apiFetch<StaffMemberDto>(`/staff/${id}/deactivate`, { method: 'PATCH' }),
}
