import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('keeps waiter calls visible until they are manually dismissed', () => {
    render(<App />)

    act(() => {
      window.dispatchEvent(
        new CustomEvent('waiter:called', {
          detail: { tableNumber: 4, reason: 'NEED_BILL' },
        }),
      )
    })

    expect(screen.getByText('Стол №4 просит счёт')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(screen.queryByText('Стол №4 просит счёт')).not.toBeInTheDocument()
  })

  it('uses the agreed wording when a waiter is requested', () => {
    render(<App />)

    act(() => {
      window.dispatchEvent(
        new CustomEvent('waiter:called', {
          detail: { tableNumber: 8, reason: 'CALL_STAFF' },
        }),
      )
    })

    expect(screen.getByText('Стол №8 просит официанта')).toBeInTheDocument()
  })
})
