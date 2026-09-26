const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'
const GUEST_SESSION_STORAGE_KEY = 'guest_session_id'

export function getGuestSessionId(): string {
  const existingId = localStorage.getItem(GUEST_SESSION_STORAGE_KEY)
  if (existingId) return existingId

  const guestSessionId = crypto.randomUUID()
  localStorage.setItem(GUEST_SESSION_STORAGE_KEY, guestSessionId)
  return guestSessionId
}

export async function createGuestOrder<T>(
  qrToken: string,
  order: T,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetcher(`${API_BASE}/guest/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-QR-Token': qrToken },
    body: JSON.stringify({ ...order, guestSessionId: getGuestSessionId() }),
  })
  if (!response.ok) throw new Error('Unable to create guest order')
  return response.json()
}
