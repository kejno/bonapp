import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OnboardingStep3Page from './OnboardingStep3Page'
import { useAuthStore } from '../auth/auth.store'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAuthStore.setState({ accessToken: null, user: null })
})

describe('OnboardingStep3Page', () => {
  it('allows skipping payment setup and explains waiter payment remains available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ oplati: false, erip: false, bepaid: false, skno: false }),
    })
    vi.stubGlobal('fetch', fetchMock)
    useAuthStore.setState({ accessToken: 'test-token' })

    render(<OnboardingStep3Page />)

    expect(screen.getByRole('link', { name: 'Пропустить' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByText('Без подключённых шлюзов доступна оплата официанту.')).toBeInTheDocument()
    expect(screen.getByText('Оплати™ QR · комиссия 0,8%')).toBeInTheDocument()
    expect(await screen.findAllByText('Не подключено')).toHaveLength(4)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/admin/tenant/onboarding/step3/payments')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer test-token' } })
  })
})
