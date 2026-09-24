import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the login page at /login route', () => {
    window.history.pushState({}, '', '/login')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Bonapp' })).toBeInTheDocument()
  })

  it('redirects from / to /login', () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Bonapp' })).toBeInTheDocument()
  })
})
