import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PlatformMetricsDto,
  TenantsListDto,
  TenantSummaryDto,
  PlanType,
} from '@bonapp/shared-types';

const BASE = '/api/superadmin';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function usePlatformMetrics() {
  return useQuery<PlatformMetricsDto>({
    queryKey: ['superadmin', 'metrics'],
    queryFn: () => fetchJson(`${BASE}/metrics`),
  });
}

export function useTenants(filters: { plan?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters.plan) params.set('plan', filters.plan);
  if (filters.status) params.set('status', filters.status);
  const qs = params.toString();
  return useQuery<TenantsListDto>({
    queryKey: ['superadmin', 'tenants', filters],
    queryFn: () => fetchJson(`${BASE}/tenants${qs ? `?${qs}` : ''}`),
  });
}

export function useChangePlan() {
  const qc = useQueryClient();
  return useMutation<TenantSummaryDto, Error, { id: string; plan: PlanType }>({
    mutationFn: ({ id, plan }) =>
      fetchJson(`${BASE}/tenants/${id}/plan`, { method: 'PATCH', body: JSON.stringify({ plan }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] }),
  });
}

export function useBlockTenant() {
  const qc = useQueryClient();
  return useMutation<TenantSummaryDto, Error, string>({
    mutationFn: (id) => fetchJson(`${BASE}/tenants/${id}/block`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] }),
  });
}

export function useUnblockTenant() {
  const qc = useQueryClient();
  return useMutation<TenantSummaryDto, Error, string>({
    mutationFn: (id) => fetchJson(`${BASE}/tenants/${id}/unblock`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] }),
  });
}

export function useExtendTrial() {
  const qc = useQueryClient();
  return useMutation<TenantSummaryDto, Error, string>({
    mutationFn: (id) => fetchJson(`${BASE}/tenants/${id}/trial`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] }),
  });
}
