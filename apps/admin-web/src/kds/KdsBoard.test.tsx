import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KdsBoard } from './KdsBoard'
import type { KdsOrder } from './types'

const orders: KdsOrder[] = [
  {
    id: 'order-48',
    number: '048',
    table: '7',
    waiter: 'Анна',
    status: 'new',
    createdAt: '2026-09-18T10:00:00.000Z',
    items: [
      { id: 'item-1', name: 'Борщ', quantity: 1, kitchen: 'hot' },
      { id: 'item-2', name: 'Лимонад', quantity: 2, kitchen: 'bar' },
    ],
  },
]

describe('KdsBoard', () => {
  it('shows each order in the New column and bumps it to Preparing', async () => {
    const updateOrderStatus = vi.fn().mockResolvedValue(undefined)

    render(<KdsBoard initialOrders={orders} updateOrderStatus={updateOrderStatus} />)

    expect(screen.getByRole('heading', { name: 'Новые' })).toBeInTheDocument()
    expect(screen.getByText('#048')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bump заказ #048' }))

    expect(await screen.findByTestId('kds-column-preparing')).toHaveTextContent('#048')
    expect(updateOrderStatus).toHaveBeenCalledWith('order-48', 'preparing', undefined)
  })

  it('shows only matching items for a selected kitchen while retaining a multi-kitchen order', () => {
    render(<KdsBoard initialOrders={orders} updateOrderStatus={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Бар' }))

    expect(screen.getByText('Лимонад ×2')).toBeInTheDocument()
    expect(screen.queryByText('Борщ ×1')).not.toBeInTheDocument()
    expect(screen.getByText('#048')).toBeInTheDocument()
  })
})
