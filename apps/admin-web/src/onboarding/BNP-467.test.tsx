import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OnboardingStep2Page from './OnboardingStep2Page';
import * as onboardingApi from './onboarding.api';

vi.mock('./onboarding.api', () => ({
  checkPos: vi.fn(), getImportStatus: vi.fn(), retryImport: vi.fn(), savePos: vi.fn(), startImport: vi.fn(),
}));

describe('BNP-467: ошибка проверки POS', () => {
  it('показывает ошибку неверных реквизитов и не запускает импорт', async () => {
    vi.mocked(onboardingApi.getImportStatus).mockResolvedValue({ status: 'idle' });
    vi.mocked(onboardingApi.checkPos).mockRejectedValue(new Error('Неверный API-ключ'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OnboardingStep2Page /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText('URL POS-системы'), { target: { value: 'https://pos.example.com' } });
    fireEvent.change(screen.getByLabelText('API-ключ'), { target: { value: 'invalid-key' } });
    fireEvent.change(screen.getByLabelText('App ID интеграции'), { target: { value: 'app-1' } });
    fireEvent.change(screen.getByLabelText('Client secret'), { target: { value: 'secret-1' } });
    fireEvent.change(screen.getByLabelText('ID организации'), { target: { value: 'org-1' } });
    fireEvent.change(screen.getByLabelText('ID терминальной группы'), { target: { value: 'terminal-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить подключение' }));

    expect(await screen.findByText('Неверный API-ключ')).toBeInTheDocument();
    expect(vi.mocked(onboardingApi.checkPos).mock.calls[0][0]).toEqual({ posType: 'iiko', apiKey: 'invalid-key', url: 'https://pos.example.com', appId: 'app-1', clientSecret: 'secret-1', organizationId: 'org-1', terminalGroupId: 'terminal-1' });
    expect(onboardingApi.startImport).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Импортировать меню' })).toBeEnabled());
  });
});
