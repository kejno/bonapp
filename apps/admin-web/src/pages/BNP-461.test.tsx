import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OnboardingStep1Page from './OnboardingStep1Page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BNP-461: taken onboarding slug', () => {
  it('shows the slug conflict and stays on step 1', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: true }) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ code: 'SLUG_TAKEN', message: 'Этот адрес уже занят' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/onboarding/step-1']}>
        <Routes>
          <Route path="/onboarding/step-1" element={<OnboardingStep1Page />} />
          <Route path="/onboarding/step-2" element={<h1>Шаг 2</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Название заведения *'), { target: { value: 'Кафе' } });
    fireEvent.change(screen.getByLabelText('Субдомен'), { target: { value: 'taken-cafe' } });
    fireEvent.change(screen.getByLabelText('Юридическое название *'), { target: { value: 'ООО Кафе' } });
    fireEvent.change(screen.getByLabelText(/УНП/), { target: { value: '123456789' } });
    fireEvent.change(screen.getByLabelText('Адрес заведения *'), { target: { value: 'Минск' } });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(await screen.findByText('Этот адрес уже занят. Выберите другой.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Шаг 2' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Профиль заведения' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
