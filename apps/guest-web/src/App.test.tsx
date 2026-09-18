import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders an ordered menu and filters dishes locally', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tableNumber: 12,
        categories: [
          {
            id: 'starters',
            name: 'Закуски',
            dishes: [
              {
                id: 'bruschetta',
                name: 'Брускетта',
                description: 'С томатами',
                price: 1250,
                isHit: true,
                isInStopList: false,
                modifiers: [],
              },
            ],
          },
          {
            id: 'desserts',
            name: 'Десерты',
            dishes: [
              {
                id: 'cheesecake',
                name: 'Чизкейк',
                description: 'Сливочный десерт',
                price: 900,
                isHit: false,
                isInStopList: true,
                modifiers: [],
              },
            ],
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByText('Стол №12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Закуски' })).toBeInTheDocument()
    expect(screen.getByText('🔥')).toBeInTheDocument()
    expect(screen.getByText('Нет в наличии')).toBeInTheDocument()
    expect(screen.getByText('Корзина · 0 позиций')).toBeInTheDocument()
    expect(screen.queryByText('Вызвать официанта')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'сливочный' },
    })

    expect(screen.queryByText('Брускетта')).not.toBeInTheDocument()
    expect(screen.getByText('Чизкейк')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/guest/menu')
  })
})
