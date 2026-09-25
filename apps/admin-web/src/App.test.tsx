import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { useAuthStore } from './auth/auth.store'

afterEach(() => {
  cleanup()
  act(() => {
    useAuthStore.getState().clearAuth()
  })
})

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

  it('redirects an authenticated user from /login to /dashboard', () => {
    act(() => {
      useAuthStore.getState().setAuth('access-token', {
        id: 'user-1',
        email: 'admin@example.com',
        role: 'OWNER',
        tenantId: 'tenant-1',
        fullName: 'Admin',
      })
    })
    window.history.pushState({}, '', '/login')

    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Добро пожаловать, Admin' }),
    ).toBeInTheDocument()
  })
})
