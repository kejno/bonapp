import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WelcomePage from './WelcomePage'

vi.mock('../welcome/welcome.api', () => ({
  getReadiness: vi.fn().mockResolvedValue({ menuReady: false, tablesReady: false, paymentsReady: false, hasOrders: false, hasActiveShift: false, canSimulateOrder: false }),
  openShift: vi.fn(),
  simulateTestOrder: vi.fn(),
}))

afterEach(cleanup)

describe('WelcomePage', () => {
  it('shows zero states and an incomplete tenant readiness checklist', async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WelcomePage /></QueryClientProvider></MemoryRouter>)

    expect(await screen.findByText('Заказов пока нет')).toBeInTheDocument()
    expect(screen.getByText('Смена не открыта')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Меню добавлено' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Столы созданы' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Платежи настроены' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Симулировать тестовый заказ' })).toBeDisabled()
  })
})
