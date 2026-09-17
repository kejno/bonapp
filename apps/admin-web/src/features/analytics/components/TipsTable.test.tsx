import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TipsTable } from './TipsTable'
import * as useTipsModule from '../hooks/useTips'

const from = new Date('2026-09-17T00:00:00Z')
const to = new Date('2026-09-17T23:59:59Z')

describe('TipsTable', () => {
  it('shows loading state', () => {
    vi.spyOn(useTipsModule, 'useTips').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useTipsModule.useTips>)

    render(<TipsTable from={from} to={to} />)
    expect(screen.getByText('Загрузка...')).toBeInTheDocument()
  })

  it('shows empty state when no rows', () => {
    vi.spyOn(useTipsModule, 'useTips').mockReturnValue({
      data: { rows: [] },
      isLoading: false,
    } as ReturnType<typeof useTipsModule.useTips>)

    render(<TipsTable from={from} to={to} />)
    expect(screen.getByText('Чаевые за выбранный период отсутствуют')).toBeInTheDocument()
  })

  it('renders waiter names and tip totals', () => {
    vi.spyOn(useTipsModule, 'useTips').mockReturnValue({
      data: {
        rows: [
          { waiterId: 'w1', waiterName: 'alice@test.com', tableCount: 3, tipsTotal: 50 },
          { waiterId: 'w2', waiterName: 'bob@test.com', tableCount: 1, tipsTotal: 20 },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useTipsModule.useTips>)

    render(<TipsTable from={from} to={to} />)
    expect(screen.getByText('alice@test.com')).toBeInTheDocument()
    expect(screen.getByText('bob@test.com')).toBeInTheDocument()
    expect(screen.getByText('50.00')).toBeInTheDocument()
    expect(screen.getByText('20.00')).toBeInTheDocument()
  })

  it('renders table count for each waiter', () => {
    vi.spyOn(useTipsModule, 'useTips').mockReturnValue({
      data: {
        rows: [
          { waiterId: 'w1', waiterName: 'alice@test.com', tableCount: 3, tipsTotal: 50 },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useTipsModule.useTips>)

    render(<TipsTable from={from} to={to} />)
    const dataRow = screen.getAllByRole('row')[1]
    expect(dataRow).toHaveTextContent('3')
    expect(dataRow).toHaveTextContent('50.00')
  })

  it('renders rows in the order returned by the server', () => {
    vi.spyOn(useTipsModule, 'useTips').mockReturnValue({
      data: {
        rows: [
          { waiterId: 'w1', waiterName: 'alice@test.com', tableCount: 3, tipsTotal: 50 },
          { waiterId: 'w2', waiterName: 'bob@test.com', tableCount: 1, tipsTotal: 20 },
        ],
      },
      isLoading: false,
    } as ReturnType<typeof useTipsModule.useTips>)

    render(<TipsTable from={from} to={to} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('alice@test.com')
    expect(rows[1]).toHaveTextContent('bob@test.com')
  })
})
