import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ZReportSection } from './ZReportSection'
import * as useZReportModule from '../hooks/useZReport'

describe('ZReportSection', () => {
  it('shows loading state', () => {
    vi.spyOn(useZReportModule, 'useZReport').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useZReportModule.useZReport>)

    render(<ZReportSection />)
    expect(screen.getByText('Загрузка...')).toBeInTheDocument()
  })

  it('shows empty state when no shifts found', () => {
    vi.spyOn(useZReportModule, 'useZReport').mockReturnValue({
      data: { status: 'not_found', receiptCount: 0, revenue: [], refundTotal: 0 },
      isLoading: false,
    } as ReturnType<typeof useZReportModule.useZReport>)

    render(<ZReportSection />)
    expect(screen.getByText('Смены не найдены')).toBeInTheDocument()
  })

  it('shows open shift with receipt count and total revenue', () => {
    vi.spyOn(useZReportModule, 'useZReport').mockReturnValue({
      data: {
        status: 'open',
        shiftId: 'shift-1',
        openedAt: '2026-09-17T08:00:00.000Z',
        receiptCount: 5,
        revenue: [
          { method: 'OPLATI', label: 'Оплати™', amount: 300 },
          { method: 'CASH', label: 'Наличные', amount: 200 },
        ],
        refundTotal: 0,
      },
      isLoading: false,
    } as ReturnType<typeof useZReportModule.useZReport>)

    render(<ZReportSection />)
    expect(screen.getByText('Открыта')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('500.00 BYN')).toBeInTheDocument()
    expect(screen.getByText('Оплати™')).toBeInTheDocument()
    expect(screen.getByText('Наличные')).toBeInTheDocument()
  })

  it('shows closed shift status and closing time label', () => {
    vi.spyOn(useZReportModule, 'useZReport').mockReturnValue({
      data: {
        status: 'closed',
        shiftId: 'shift-2',
        openedAt: '2026-09-16T08:00:00.000Z',
        closedAt: '2026-09-16T22:00:00.000Z',
        receiptCount: 10,
        revenue: [],
        refundTotal: 50,
      },
      isLoading: false,
    } as ReturnType<typeof useZReportModule.useZReport>)

    render(<ZReportSection />)
    expect(screen.getByText('Закрыта')).toBeInTheDocument()
    expect(screen.getByText('Закрыта:')).toBeInTheDocument()
    expect(screen.getByText('50.00 BYN')).toBeInTheDocument()
  })

  it('shows revenue breakdown by payment method', () => {
    vi.spyOn(useZReportModule, 'useZReport').mockReturnValue({
      data: {
        status: 'open',
        shiftId: 'shift-1',
        openedAt: '2026-09-17T08:00:00.000Z',
        receiptCount: 3,
        revenue: [
          { method: 'OPLATI', label: 'Оплати™', amount: 300 },
          { method: 'ERIP', label: 'ЕРИП', amount: 150 },
        ],
        refundTotal: 0,
      },
      isLoading: false,
    } as ReturnType<typeof useZReportModule.useZReport>)

    render(<ZReportSection />)
    expect(screen.getByText('Выручка по методам оплаты')).toBeInTheDocument()
    expect(screen.getByText('300.00 BYN')).toBeInTheDocument()
    expect(screen.getByText('150.00 BYN')).toBeInTheDocument()
  })

  it('does not show revenue breakdown section when revenue list is empty', () => {
    vi.spyOn(useZReportModule, 'useZReport').mockReturnValue({
      data: {
        status: 'open',
        shiftId: 'shift-1',
        openedAt: '2026-09-17T08:00:00.000Z',
        receiptCount: 0,
        revenue: [],
        refundTotal: 0,
      },
      isLoading: false,
    } as ReturnType<typeof useZReportModule.useZReport>)

    render(<ZReportSection />)
    expect(screen.queryByText('Выручка по методам оплаты')).not.toBeInTheDocument()
  })
})
