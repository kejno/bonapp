import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the guest heading', () => {
    render(<App />)
    const heading = screen.getByText('Bonapp — Guest')

    expect(heading).toBeInTheDocument()
    expect(heading).toHaveClass('text-primary')
    expect(heading.parentElement).toHaveClass('bg-background')
  })
})
