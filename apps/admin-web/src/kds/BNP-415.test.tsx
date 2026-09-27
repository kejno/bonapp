import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KdsPage from './KdsPage'
import { getKdsOrders } from './kds.api'
import { useAuthStore } from '../auth/auth.store'

const { socketHandlers, soundPlay } = vi.hoisted(() => ({ socketHandlers: new Map<string, () => void>(), soundPlay: vi.fn() }))
vi.mock('./kds.api', () => ({ getKdsOrders: vi.fn(), updateKdsStatus: vi.fn(), kdsSocketUrl: 'http://localhost:3000' }))
vi.mock('howler', () => ({ Howl: class { play = soundPlay } }))
vi.mock('socket.io-client', () => ({ io: vi.fn(() => ({ on: (event: string, handler: () => void) => socketHandlers.set(event, handler), disconnect: vi.fn() })) }))

afterEach(() => { cleanup(); useAuthStore.getState().clearAuth(); socketHandlers.clear(); vi.clearAllMocks() })

describe('BNP-415: новый заказ в Live KDS', () => {
  it('показывает новый заказ в колонке «Новые» и воспроизводит уведомление', async () => {
    useAuthStore.getState().setAuth('test-token', { id: 'user-1', email: 'test@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Тест' })
    vi.mocked(getKdsOrders).mockResolvedValue({
      departments: ['HOT'],
      orders: [{ id: 'order-48', dailyOrderNumber: 48, status: 'NEW', createdAt: new Date().toISOString(), table: { tableNumber: 2, label: '2' }, assignedWaiter: null, items: [{ id: 'item-1', itemId: 'dish-1', name: 'Суп', quantity: 1, status: 'NEW', kitchenDepartment: 'HOT', itemComment: null }] }],
    })
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><KdsPage /></QueryClientProvider>)

    expect(await screen.findByText('#048')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Новые' })).toContainElement(screen.getByRole('article'))
    expect(screen.getByText(/Суп/)).toBeInTheDocument()
    socketHandlers.get('order:created')?.()

    expect(soundPlay).toHaveBeenCalledOnce()
    await waitFor(() => expect(getKdsOrders).toHaveBeenCalledTimes(2))
  })
})
