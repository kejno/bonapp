import { render, screen } from '@testing-library/react'
import { describe, beforeEach, expect, it, vi } from 'vitest'
import { AnalyticsPage } from './AnalyticsPage'
import * as useRevenueModule from './hooks/useRevenue'
import * as usePaymentSplitModule from './hooks/usePaymentSplit'
import * as useTipsModule from './hooks/useTips'
import * as useZReportModule from './hooks/useZReport'

vi.mock('recharts', () => ({
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}))

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.spyOn(useRevenueModule, 'useRevenue').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useRevenueModule.useRevenue>)
    vi.spyOn(usePaymentSplitModule, 'usePaymentSplit').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof usePaymentSplitModule.usePaymentSplit>)
    vi.spyOn(useTipsModule, 'useTips').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useTipsModule.useTips>)
    vi.spyOn(useZReportModule, 'useZReport').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useZReportModule.useZReport>)
  })

  it('renders the analytics page heading', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText('Аналитика')).toBeInTheDocument()
  })

  it('renders all date range preset buttons', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText('Сегодня')).toBeInTheDocument()
    expect(screen.getByText('Неделя')).toBeInTheDocument()
    expect(screen.getByText('Месяц')).toBeInTheDocument()
    expect(screen.getByText('Произвольный')).toBeInTheDocument()
  })

  it('renders all section headings', () => {
    render(<AnalyticsPage />)
    expect(screen.getByText('Выручка')).toBeInTheDocument()
    expect(screen.getByText('Методы оплаты')).toBeInTheDocument()
    expect(screen.getByText('Чаевые')).toBeInTheDocument()
    expect(screen.getByText('Z-отчёт')).toBeInTheDocument()
  })

  it('renders CSV export link pointing to transactions export endpoint', () => {
    render(<AnalyticsPage />)
    const link = screen.getByRole('link', { name: 'Скачать CSV' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/admin/analytics/transactions/export'),
    )
    expect(link).toHaveAttribute('download', 'transactions.csv')
  })
})
