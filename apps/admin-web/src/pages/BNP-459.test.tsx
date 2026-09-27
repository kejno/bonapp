import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OnboardingStep1Page from './OnboardingStep1Page';
import { useAuthStore } from '../auth/auth.store';

afterEach(() => {
  cleanup();
  useAuthStore.getState().clearAuth();
  vi.unstubAllGlobals();
});

describe('BNP-459: onboarding step 1', () => {
  it('saves a completed venue profile and navigates to step 2', async () => {
    useAuthStore.getState().setAuth('test-token', {
      id: 'owner-1', email: 'owner@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Владелец',
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'tenant-1', slug: 'cafe-minsk' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/onboarding/step-1']}>
        <Routes>
          <Route path="/onboarding/step-1" element={<OnboardingStep1Page />} />
          <Route path="/onboarding/step-2" element={<h1>Шаг 2</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Название заведения *'), { target: { value: 'Кафе Минск' } });
    fireEvent.change(screen.getByLabelText('Субдомен'), { target: { value: 'cafe-minsk' } });
    fireEvent.change(screen.getByLabelText('Юридическое название *'), { target: { value: 'ООО Кафе Минск' } });
    fireEvent.change(screen.getByLabelText(/УНП/), { target: { value: '123456789' } });
    fireEvent.change(screen.getByLabelText('Адрес заведения *'), { target: { value: 'Минск, ул. Ленина, 1' } });
    expect(screen.getByText('Кафе Минск')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(await screen.findByRole('heading', { name: 'Шаг 2' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/admin/tenant/onboarding/step1'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: JSON.stringify({
          name: 'Кафе Минск', slug: 'cafe-minsk', legalName: 'ООО Кафе Минск',
          unp: '123456789', address: 'Минск, ул. Ленина, 1', brandColor: '#e0533c',
        }),
      }),
    );
  });
});
