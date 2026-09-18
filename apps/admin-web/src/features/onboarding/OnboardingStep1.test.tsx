import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingStep1 } from './OnboardingStep1'

describe('OnboardingStep1', () => {
  it('keeps Next disabled until required profile fields and UNP are valid', () => {
    render(<OnboardingStep1 onComplete={vi.fn()} />)

    const next = screen.getByRole('button', { name: 'Далее' })
    expect(next).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Название заведения'), { target: { value: 'Кафе У Петра' } })
    fireEvent.change(screen.getByLabelText('Юридическое название'), { target: { value: 'ООО Петр' } })
    fireEvent.change(screen.getByLabelText('Адрес'), { target: { value: 'Минск, ул. Ленина, 1' } })
    fireEvent.change(screen.getByLabelText('УНП'), { target: { value: '12345678' } })
    expect(next).toBeDisabled()

    fireEvent.change(screen.getByLabelText('УНП'), { target: { value: '123456789' } })
    expect(next).toBeEnabled()
    expect(screen.getByLabelText('Субдомен')).toHaveValue('kafe-u-petra')
  })

  it('saves fixed Minsk timezone and completes the step', async () => {
    const onComplete = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    render(<OnboardingStep1 onComplete={onComplete} />)

    fireEvent.change(screen.getByLabelText('Название заведения'), { target: { value: 'Cafe' } })
    fireEvent.change(screen.getByLabelText('Юридическое название'), { target: { value: 'Cafe LLC' } })
    fireEvent.change(screen.getByLabelText('Адрес'), { target: { value: 'Minsk' } })
    fireEvent.change(screen.getByLabelText('УНП'), { target: { value: '123456789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }))

    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ timezone: 'Europe/Minsk', slug: 'cafe' })
    vi.unstubAllGlobals()
  })
})
