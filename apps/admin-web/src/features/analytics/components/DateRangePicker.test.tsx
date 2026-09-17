import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DateRangePicker } from './DateRangePicker'

const from = new Date('2026-09-17T00:00:00Z')
const to = new Date('2026-09-17T23:59:59Z')

describe('DateRangePicker', () => {
  it('renders all preset buttons', () => {
    render(
      <DateRangePicker
        preset="today"
        from={from}
        to={to}
        onPresetChange={vi.fn()}
        onCustomRangeChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Сегодня')).toBeInTheDocument()
    expect(screen.getByText('Неделя')).toBeInTheDocument()
    expect(screen.getByText('Месяц')).toBeInTheDocument()
    expect(screen.getByText('Произвольный')).toBeInTheDocument()
  })

  it('highlights the active preset button', () => {
    render(
      <DateRangePicker
        preset="week"
        from={from}
        to={to}
        onPresetChange={vi.fn()}
        onCustomRangeChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Неделя').className).toContain('bg-bonapp-accent')
    expect(screen.getByText('Сегодня').className).not.toContain('bg-bonapp-accent')
  })

  it('calls onPresetChange when a preset button is clicked', () => {
    const onPresetChange = vi.fn()
    render(
      <DateRangePicker
        preset="today"
        from={from}
        to={to}
        onPresetChange={onPresetChange}
        onCustomRangeChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Неделя'))
    expect(onPresetChange).toHaveBeenCalledWith('week')
  })

  it('calls onPresetChange for each preset button', () => {
    const onPresetChange = vi.fn()
    render(
      <DateRangePicker
        preset="today"
        from={from}
        to={to}
        onPresetChange={onPresetChange}
        onCustomRangeChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Месяц'))
    expect(onPresetChange).toHaveBeenCalledWith('month')
    fireEvent.click(screen.getByText('Произвольный'))
    expect(onPresetChange).toHaveBeenCalledWith('custom')
  })

  it('shows date inputs when custom preset is active', () => {
    render(
      <DateRangePicker
        preset="custom"
        from={from}
        to={to}
        onPresetChange={vi.fn()}
        onCustomRangeChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Дата начала')).toBeInTheDocument()
    expect(screen.getByLabelText('Дата окончания')).toBeInTheDocument()
  })

  it('does not show date inputs for non-custom presets', () => {
    render(
      <DateRangePicker
        preset="today"
        from={from}
        to={to}
        onPresetChange={vi.fn()}
        onCustomRangeChange={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Дата начала')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Дата окончания')).not.toBeInTheDocument()
  })

  it('calls onCustomRangeChange when start date input changes', () => {
    const onCustomRangeChange = vi.fn()
    render(
      <DateRangePicker
        preset="custom"
        from={from}
        to={to}
        onPresetChange={vi.fn()}
        onCustomRangeChange={onCustomRangeChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Дата начала'), {
      target: { value: '2026-09-10' },
    })
    expect(onCustomRangeChange).toHaveBeenCalledWith(new Date('2026-09-10'), to)
  })

  it('calls onCustomRangeChange when end date input changes', () => {
    const onCustomRangeChange = vi.fn()
    render(
      <DateRangePicker
        preset="custom"
        from={from}
        to={to}
        onPresetChange={vi.fn()}
        onCustomRangeChange={onCustomRangeChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Дата окончания'), {
      target: { value: '2026-09-20' },
    })
    expect(onCustomRangeChange).toHaveBeenCalledWith(from, new Date('2026-09-20'))
  })
})
