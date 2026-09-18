import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingStep2 } from './OnboardingStep2'

describe('OnboardingStep2', () => {
  it('позволяет пропустить шаг при выборе «Без POS»', async () => {
    const onSkip = vi.fn()
    render(<OnboardingStep2 onSkip={onSkip} />)

    fireEvent.click(screen.getByLabelText('Без POS'))
    fireEvent.click(screen.getByRole('button', { name: 'Пропустить' }))

    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('проверяет iiko и показывает прогресс импорта', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pingMs: 42, itemsCount: 120 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'import-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'running', importedItems: 48, totalItems: 120 }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<OnboardingStep2 />)

    fireEvent.click(screen.getByLabelText('iiko Cloud'))
    fireEvent.change(screen.getByLabelText('API-ключ'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Проверить подключение' }))
    await screen.findByText('Соединение проверено: 42 мс, 120 позиций')
    fireEvent.click(screen.getByRole('button', { name: 'Импортировать меню' }))

    await waitFor(() => expect(screen.getByText('Импортировано 48/120 позиций')).toBeInTheDocument())
  })
})
