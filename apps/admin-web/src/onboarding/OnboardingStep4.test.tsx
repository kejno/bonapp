import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingStep4 } from './OnboardingStep4'

describe('OnboardingStep4', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('creates a zone and bulk-adds every table number to it', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'zone-1', name: 'Терраса' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 'table-1', number: 10, seats: 4, qrToken: 'token-1', qrUrl: 'https://guest.example.com/q/token-1', zoneId: 'zone-1' },
        { id: 'table-2', number: 11, seats: 4, qrToken: 'token-2', qrUrl: 'https://guest.example.com/q/token-2', zoneId: 'zone-1' },
      ]), { status: 201 }))

    render(<OnboardingStep4 tenantId="tenant-1" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Название зоны'), { target: { value: 'Терраса' } })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить зону' }))
    await screen.findByRole('button', { name: 'Терраса' })

    fireEvent.change(screen.getByLabelText('С'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('По'), { target: { value: '11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить столы' }))

    expect(await screen.findByText('Стол 10')).toBeInTheDocument()
    expect(screen.getByText('Стол 11')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/admin/tables/bulk',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
