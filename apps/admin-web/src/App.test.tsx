import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders readiness checklist and zero states when no data exists', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Добро пожаловать!' })).toBeInTheDocument()
    expect(screen.getByText('Меню добавлено')).toBeInTheDocument()
    expect(screen.getByText('Столы созданы')).toBeInTheDocument()
    expect(screen.getByText('Платежи настроены')).toBeInTheDocument()
    expect(screen.getByText('Нет заказов')).toBeInTheDocument()
    expect(screen.getByText('Нет активной смены')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Симулировать тестовый заказ' })).toBeDisabled()
  })
})
