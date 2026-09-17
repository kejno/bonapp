import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { useZReport } from './useZReport'
import * as client from '../../../api/client'

vi.mock('../../../api/client')

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useZReport', () => {
  it('fetches from z-report endpoint and returns not_found data', async () => {
    const expected = {
      status: 'not_found' as const,
      receiptCount: 0,
      revenue: [],
      refundTotal: 0,
    }
    vi.spyOn(client, 'apiGet').mockResolvedValueOnce(expected)

    const { result } = renderHook(() => useZReport(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(expected)
    expect(client.apiGet).toHaveBeenCalledWith('/api/v1/admin/analytics/z-report')
  })

  it('returns open shift data', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValueOnce({
      status: 'open',
      shiftId: 'shift-1',
      openedAt: '2026-09-17T08:00:00.000Z',
      receiptCount: 5,
      revenue: [{ method: 'CASH', label: 'Наличные', amount: 500 }],
      refundTotal: 0,
    })

    const { result } = renderHook(() => useZReport(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.status).toBe('open')
    expect(result.current.data?.receiptCount).toBe(5)
  })

  it('returns closed shift data', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValueOnce({
      status: 'closed',
      shiftId: 'shift-2',
      openedAt: '2026-09-16T08:00:00.000Z',
      closedAt: '2026-09-16T22:00:00.000Z',
      receiptCount: 10,
      revenue: [],
      refundTotal: 50,
    })

    const { result } = renderHook(() => useZReport(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.status).toBe('closed')
    expect(result.current.data?.refundTotal).toBe(50)
  })
})
