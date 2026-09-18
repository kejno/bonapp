import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the first onboarding step', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Профиль заведения' })).toBeInTheDocument()
  })
})
