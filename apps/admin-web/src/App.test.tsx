import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the admin heading', () => {
    render(<App />)
    const heading = screen.getByText('Bonapp — Admin')

    expect(heading).toBeInTheDocument()
    expect(heading).toHaveClass('text-primary')
    expect(heading.parentElement).toHaveClass('bg-background')
  })
})
