import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as analyticsApi from '../api/analyticsApi'
import { Dashboard } from './Dashboard'

vi.mock('../api/analyticsApi', () => ({
  fetchDailySummary: vi.fn(),
  fetchPaymentsSplit: vi.fn(),
  fetchTips: vi.fn(),
}))

const mockSummary: analyticsApi.DailySummary = {
  date: '2026-09-17',
  revenueTotal: 2400,
  avgCheck: 800,
  orderCount: 3,
  tableOccupancyPercent: 40,
  posPingMs: null,
  topDishes: [
    { menuItemId: 'item-1', name: 'Бургер', quantitySold: 10, totalRevenue: 300 },
    { menuItemId: 'item-2', name: 'Картошка', quantitySold: 8, totalRevenue: 160 },
  ],
}

const mockPayments: analyticsApi.PaymentMethodStats[] = [
  { method: 'CARD', amount: 2000, transactionCount: 2 },
  { method: 'CASH', amount: 400, transactionCount: 1 },
  { method: 'OPLATI', amount: 0, transactionCount: 0 },
  { method: 'ERIP', amount: 0, transactionCount: 0 },
]

const mockTips: analyticsApi.WaiterTips[] = [
  { waiterId: 'waiter-1', totalAmount: 50, transactionCount: 2 },
]

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard tenantId="tenant-1" />
    </QueryClientProvider>,
  )
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(analyticsApi.fetchDailySummary).mockResolvedValue(mockSummary)
    vi.mocked(analyticsApi.fetchPaymentsSplit).mockResolvedValue(mockPayments)
    vi.mocked(analyticsApi.fetchTips).mockResolvedValue(mockTips)
  })

  it('shows loading state initially', () => {
    renderDashboard()
    expect(screen.getByText(/загрузка/i)).toBeInTheDocument()
  })

  it('renders revenue stat after data loads', async () => {
    renderDashboard()
    expect(await screen.findByText(/2400\.00 BYN/)).toBeInTheDocument()
  })

  it('renders average check', async () => {
    renderDashboard()
    expect(await screen.findByText(/800\.00 BYN/)).toBeInTheDocument()
  })

  it('renders order count', async () => {
    renderDashboard()
    expect(await screen.findByText('3')).toBeInTheDocument()
  })

  it('renders table occupancy percentage', async () => {
    renderDashboard()
    expect(await screen.findByText('40%')).toBeInTheDocument()
  })

  it('renders top dishes list', async () => {
    renderDashboard()
    expect(await screen.findByText('Бургер')).toBeInTheDocument()
    expect(screen.getByText('Картошка')).toBeInTheDocument()
  })

  it('shows top dishes rank numbers', async () => {
    renderDashboard()
    await screen.findByText('Бургер')
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders payment methods', async () => {
    renderDashboard()
    expect(await screen.findByText('Карта')).toBeInTheDocument()
    expect(screen.getByText('Наличные')).toBeInTheDocument()
    expect(screen.getByText('Оплати')).toBeInTheDocument()
    expect(screen.getByText('ЕРИП')).toBeInTheDocument()
  })

  it('renders tips by waiter', async () => {
    renderDashboard()
    expect(await screen.findByText('waiter-1')).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(analyticsApi.fetchDailySummary).mockRejectedValue(new Error('Network error'))
    renderDashboard()
    expect(await screen.findByText(/ошибка/i)).toBeInTheDocument()
  })

  it('shows POS no-data status when posPingMs is null', async () => {
    renderDashboard()
    expect(await screen.findByText(/нет данных/i)).toBeInTheDocument()
  })

  it('shows date from summary', async () => {
    renderDashboard()
    expect(await screen.findByText(/2026-09-17/)).toBeInTheDocument()
  })
})
