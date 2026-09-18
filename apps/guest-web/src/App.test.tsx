import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { useCartStore } from './features/cart/cart-store'

describe('App', () => {
  beforeEach(() => useCartStore.getState().clear())

  it('adds a configured dish to the cart', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /карбонара/i }))
    fireEvent.click(screen.getByRole('radio', { name: /тальятелле/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /дополнительный бекон/i }))
    fireEvent.click(screen.getByRole('button', { name: /добавить в заказ/i }))

    expect(screen.getByLabelText('Корзина')).toHaveTextContent('1')
  })

  it('shows an error until a required modifier is selected', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /карбонара/i }))
    fireEvent.click(screen.getByRole('button', { name: /добавить в заказ/i }))

    expect(screen.getByText('Выберите вариант пасты')).toBeInTheDocument()
  })
})
