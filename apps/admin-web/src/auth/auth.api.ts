import type { LoginCredentials, LoginResponse } from './auth.types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export async function loginRequest(
  credentials: LoginCredentials,
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(credentials),
  });

  if (res.ok) {
    return res.json() as Promise<LoginResponse>;
  }

  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  const message =
    typeof body['message'] === 'string'
      ? body['message']
      : res.status === 403
        ? 'Аккаунт заблокирован'
        : 'Неверный логин или пароль';

  throw new Error(message);
}

export async function verifyTotpRequest(challenge: string, code: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/2fa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ challenge, code }),
  });
  if (res.ok) return res.json() as Promise<LoginResponse>;
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  throw new Error(typeof body['message'] === 'string' ? body['message'] : 'Неверный код подтверждения');
}
