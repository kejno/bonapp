import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PaymentSplitChart } from './PaymentSplitChart'
import * as usePaymentSplitModule from '../hooks/usePaymentSplit'

vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data }: any) => <div data-testid="pie" data-count={data?.length} />,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}))

const from = new Date('2026-09-17T00:00:00Z')
const to = new Date('2026-09-17T23:59:59Z')

describe('PaymentSplitChart', () => {
  it('shows loading state', () => {
    vi.spyOn(usePaymentSplitModule, 'usePaymentSplit').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof usePaymentSplitModule.usePaymentSplit>)

    render(<PaymentSplitChart from={from} to={to} />)
    expect(screen.getByText('Загрузка...')).toBeInTheDocument()
  })

  it('shows empty state when no payment items', () => {
    vi.spyOn(usePaymentSplitModule, 'usePaymentSplit').mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    } as ReturnType<typeof usePaymentSplitModule.usePaymentSplit>)

    render(<PaymentSplitChart from={from} to={to} />)
    expect(screen.getByText('Нет данных за выбранный период')).toBeInTheDocument()
  })

  it('renders pie chart with correct data count when items present', () => {
    vi.spyOn(usePaymentSplitModule, 'usePaymentSplit').mockReturnValue({
      data: {
        items: [
          { method: 'OPLATI', label: 'Оплати™', amount: 300, percentage: 75 },
          { method: 'CASH', label: 'Наличные', amount: 100, percentage: 25 },
        ],
        total: 400,
      },
      isLoading: false,
    } as ReturnType<typeof usePaymentSplitModule.usePaymentSplit>)

    render(<PaymentSplitChart from={from} to={to} />)
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    expect(screen.getByTestId('pie')).toHaveAttribute('data-count', '2')
  })

  it('renders pie chart with single item', () => {
    vi.spyOn(usePaymentSplitModule, 'usePaymentSplit').mockReturnValue({
      data: {
        items: [{ method: 'CASH', label: 'Наличные', amount: 500, percentage: 100 }],
        total: 500,
      },
      isLoading: false,
    } as ReturnType<typeof usePaymentSplitModule.usePaymentSplit>)

    render(<PaymentSplitChart from={from} to={to} />)
    expect(screen.getByTestId('pie')).toHaveAttribute('data-count', '1')
  })
})
