import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./api/analyticsApi', () => ({
  fetchDailySummary: vi.fn(() => new Promise(() => {})),
  fetchPaymentsSplit: vi.fn(() => new Promise(() => {})),
  fetchTips: vi.fn(() => new Promise(() => {})),
}))

describe('App', () => {
  it('renders the dashboard loading state', () => {
    render(<App />)
    expect(screen.getByText(/загрузка/i)).toBeInTheDocument()
  })
})
