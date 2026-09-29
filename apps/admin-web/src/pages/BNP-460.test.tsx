import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import OnboardingStep1Page from './OnboardingStep1Page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BNP-460: onboarding step 1 validation', () => {
  it('keeps step 2 blocked for an invalid UNP or missing required fields', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><OnboardingStep1Page /></MemoryRouter>);

    const nextButton = screen.getByRole('button', { name: 'Далее' });
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Название заведения *'), { target: { value: 'Кафе' } });
    fireEvent.change(screen.getByLabelText('Субдомен'), { target: { value: 'cafe' } });
    fireEvent.change(screen.getByLabelText('Юридическое название *'), { target: { value: 'ООО Кафе' } });
    fireEvent.change(screen.getByLabelText(/УНП/), { target: { value: '12345678a' } });
    fireEvent.change(screen.getByLabelText('Адрес заведения *'), { target: { value: 'Минск' } });

    expect(screen.getByLabelText(/УНП/)).toHaveValue('12345678');
    expect(nextButton).toBeDisabled();
    fireEvent.click(nextButton);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
