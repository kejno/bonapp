import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGuestOrder, getGuestSessionId } from './guest-session'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('guest session identity', () => {
  it('creates and reuses a UUID in localStorage', () => {
    const uuid = '3f3b8e2c-4d63-4ba7-a52b-91ec5991c1a3'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid)

    expect(getGuestSessionId()).toBe(uuid)
    expect(localStorage.getItem('guest_session_id')).toBe(uuid)
    expect(getGuestSessionId()).toBe(uuid)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it('sends the stored guest session UUID with the QR context when creating an order', async () => {
    localStorage.setItem('guest_session_id', '3f3b8e2c-4d63-4ba7-a52b-91ec5991c1a3')
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ orderId: 'order-1' }) })

    await createGuestOrder('qr-token', { items: [], comment: '' }, fetcher)

    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/guest\/orders$/), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-QR-Token': 'qr-token' }),
      body: JSON.stringify({ items: [], comment: '', guestSessionId: '3f3b8e2c-4d63-4ba7-a52b-91ec5991c1a3' }),
    }))
  })
})
