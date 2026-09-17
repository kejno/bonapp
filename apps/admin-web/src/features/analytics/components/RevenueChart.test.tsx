import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RevenueChart } from './RevenueChart'
import * as useRevenueModule from '../hooks/useRevenue'

vi.mock('recharts', () => ({
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}))

const from = new Date('2026-09-17T00:00:00Z')
const to = new Date('2026-09-17T23:59:59Z')

describe('RevenueChart', () => {
  it('shows loading state', () => {
    vi.spyOn(useRevenueModule, 'useRevenue').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useRevenueModule.useRevenue>)

    render(<RevenueChart from={from} to={to} granularity="hour" />)
    expect(screen.getByText('Загрузка...')).toBeInTheDocument()
  })

  it('shows empty state when data has no points', () => {
    vi.spyOn(useRevenueModule, 'useRevenue').mockReturnValue({
      data: { data: [], granularity: 'hour' },
      isLoading: false,
    } as ReturnType<typeof useRevenueModule.useRevenue>)

    render(<RevenueChart from={from} to={to} granularity="hour" />)
    expect(screen.getByText('Нет данных за выбранный период')).toBeInTheDocument()
  })

  it('renders area chart when data is present', () => {
    vi.spyOn(useRevenueModule, 'useRevenue').mockReturnValue({
      data: {
        data: [
          { timestamp: '2026-09-17T10:00:00Z', revenue: 150 },
          { timestamp: '2026-09-17T11:00:00Z', revenue: 200 },
        ],
        granularity: 'hour',
      },
      isLoading: false,
    } as ReturnType<typeof useRevenueModule.useRevenue>)

    render(<RevenueChart from={from} to={to} granularity="hour" />)
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('does not show loading text when chart is rendered', () => {
    vi.spyOn(useRevenueModule, 'useRevenue').mockReturnValue({
      data: {
        data: [{ timestamp: '2026-09-17T10:00:00Z', revenue: 100 }],
        granularity: 'hour',
      },
      isLoading: false,
    } as ReturnType<typeof useRevenueModule.useRevenue>)

    render(<RevenueChart from={from} to={to} granularity="hour" />)
    expect(screen.queryByText('Загрузка...')).not.toBeInTheDocument()
  })
})
