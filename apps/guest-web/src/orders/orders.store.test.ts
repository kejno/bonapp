import { afterEach, describe, expect, it } from 'vitest'
import { useOrdersStore } from './orders.store'

afterEach(() => useOrdersStore.setState({ order: null }))

describe('guest order snapshot updates', () => {
  it('does not replace a newer socket status with a delayed older snapshot', () => {
    useOrdersStore.getState().setOrder({
      id: 'order-1', dailyOrderNumber: 48, status: 'READY', estimatedReadyAt: null,
      updatedAt: '2026-09-26T12:02:00.000Z',
    })

    useOrdersStore.getState().setOrder({
      id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', estimatedReadyAt: null,
      updatedAt: '2026-09-26T12:01:00.000Z',
    })

    expect(useOrdersStore.getState().order?.status).toBe('READY')
  })
})
