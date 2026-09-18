import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  })

  it('renders the admin heading', () => {
    render(<App />)
    expect(screen.getByText('Bonapp — Admin')).toBeInTheDocument()
  })
})
