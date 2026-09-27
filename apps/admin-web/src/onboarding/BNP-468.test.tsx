import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OnboardingStep2Page from './OnboardingStep2Page';
import * as onboardingApi from './onboarding.api';

vi.mock('./onboarding.api', () => ({
  checkPos: vi.fn(), getImportStatus: vi.fn(), retryImport: vi.fn(), savePos: vi.fn(), startImport: vi.fn(),
}));

describe('BNP-468: пропуск подключения POS', () => {
  it('завершает шаг без сохранения POS-реквизитов', async () => {
    vi.mocked(onboardingApi.getImportStatus).mockResolvedValue({ status: 'idle' });
    vi.mocked(onboardingApi.savePos).mockResolvedValue({ posType: 'none' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OnboardingStep2Page /></QueryClientProvider>);

    fireEvent.change(screen.getByLabelText('POS-система'), { target: { value: 'none' } });
    expect(screen.getByLabelText('POS-система')).toHaveValue('none');
    fireEvent.click(screen.getByRole('button', { name: 'Пропустить' }));

    await waitFor(() => expect(onboardingApi.savePos).toHaveBeenCalled());
    expect(vi.mocked(onboardingApi.savePos).mock.calls[0][0]).toEqual({ posType: 'none', apiKey: '', url: '' });
    expect(await screen.findByText('Шаг пропущен')).toBeInTheDocument();
    expect(onboardingApi.checkPos).not.toHaveBeenCalled();
    expect(onboardingApi.startImport).not.toHaveBeenCalled();
  });
});
