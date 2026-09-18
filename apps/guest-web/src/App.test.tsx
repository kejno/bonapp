import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the selected waiter-call reason and confirms the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Вызвать официанта' }))
    fireEvent.click(screen.getByRole('button', { name: 'Попросить счёт' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/guest/call-waiter', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'NEED_BILL' }),
      })
    })
    expect(screen.getByText('Официант уже идёт')).toBeInTheDocument()
  })
})
