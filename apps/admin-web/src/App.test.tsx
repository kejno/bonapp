import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders onboarding step 2', () => {
    render(<App />)
    expect(screen.getByText('Подключите POS-систему')).toBeInTheDocument()
  })
})
