import type {
  IntegrationsStatusResponseDto,
  UpdateTenantSettingsDto,
} from '@bonapp/shared-types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:3000';

function headers(tenantId: string): Record<string, string> {
  return { 'x-tenant-id': tenantId };
}

export async function fetchIntegrationsStatus(
  tenantId: string,
): Promise<IntegrationsStatusResponseDto> {
  const res = await fetch(`${API_BASE}/api/v1/admin/integrations/status`, {
    headers: headers(tenantId),
  });
  if (!res.ok) throw new Error('Failed to fetch integrations status');
  return res.json() as Promise<IntegrationsStatusResponseDto>;
}

export async function updateTenantSettings(
  tenantId: string,
  dto: UpdateTenantSettingsDto,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/admin/tenant/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers(tenantId) },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).message ?? 'Failed to update settings');
  }
}

export async function syncMenu(
  tenantId: string,
  provider: 'iiko' | 'r_keeper',
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/admin/integrations/${provider}/sync`,
    { method: 'POST', headers: headers(tenantId) },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).message ?? 'Sync failed');
  }
}
