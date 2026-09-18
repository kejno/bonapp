import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('payment screen', () => {
  it('shows the available payment methods without enabling tips', () => {
    window.history.pushState({}, '', '/order/order-1/pay')

    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Счёт и оплата' }),
    ).toBeInTheDocument()
    expect(screen.getByText('25,00 BYN')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '5%' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Оплати™' })).toBeInTheDocument()
  })

  it('shows an Oplati QR code and a deep link', () => {
    window.history.pushState({}, '', '/order/order-1/pay')

    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Оплати™' }))

    expect(
      screen.getByLabelText('QR-код для оплаты через Оплати™'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Открыть приложение' }),
    ).toHaveAttribute('href', 'oplati://pay/order-1')
    expect(screen.getByText('Ожидаем подтверждение оплаты')).toBeInTheDocument()
  })

  it('allows switching to ERIP instructions', () => {
    window.history.pushState({}, '', '/order/order-1/pay')

    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'ЕРИП' }))

    expect(screen.getByText('Код E-POS')).toBeInTheDocument()
    expect(
      screen.getByText('1. Откройте приложение вашего банка'),
    ).toBeInTheDocument()
  })
})
