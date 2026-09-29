import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OnboardingStep2Page from './OnboardingStep2Page';
import * as onboardingApi from './onboarding.api';

vi.mock('./onboarding.api', () => ({
  checkPos: vi.fn(), getImportStatus: vi.fn(), retryImport: vi.fn(), savePos: vi.fn(), startImport: vi.fn(),
}));

describe('BNP-466: подключение POS и импорт меню', () => {
  it('сохраняет настройки, запускает импорт и показывает завершённый прогресс', async () => {
    vi.mocked(onboardingApi.getImportStatus)
      .mockResolvedValueOnce({ status: 'idle' })
      .mockResolvedValueOnce({ status: 'idle' })
      .mockResolvedValue({ status: 'completed', imported: 2, total: 2 });
    vi.mocked(onboardingApi.checkPos).mockResolvedValue({ pingMs: 18, productCount: 2 });
    vi.mocked(onboardingApi.savePos).mockResolvedValue({ posType: 'iiko' });
    vi.mocked(onboardingApi.startImport).mockResolvedValue({ jobId: 'import-1' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><OnboardingStep2Page /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText('URL POS-системы'), { target: { value: 'https://pos.example.com' } });
    fireEvent.change(screen.getByLabelText('API-ключ'), { target: { value: 'valid-key' } });
    fireEvent.change(screen.getByLabelText('App ID интеграции'), { target: { value: 'app-1' } });
    fireEvent.change(screen.getByLabelText('Client secret'), { target: { value: 'secret-1' } });
    fireEvent.change(screen.getByLabelText('ID организации'), { target: { value: 'org-1' } });
    fireEvent.change(screen.getByLabelText('ID терминальной группы'), { target: { value: 'terminal-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить подключение' }));

    expect(await screen.findByText('Соединение установлено · 18 мс · товаров: 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить POS' }));
    await waitFor(() => expect(onboardingApi.savePos).toHaveBeenCalled());
    expect(vi.mocked(onboardingApi.savePos).mock.calls[0][0]).toEqual({ posType: 'iiko', apiKey: 'valid-key', url: 'https://pos.example.com', appId: 'app-1', clientSecret: 'secret-1', organizationId: 'org-1', terminalGroupId: 'terminal-1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Импортировать меню' }));

    await waitFor(() => expect(onboardingApi.startImport).toHaveBeenCalledOnce());
    expect(await screen.findByText('Меню импортировано: 2 позиций. Повторный импорт недоступен.')).toBeInTheDocument();
    expect(onboardingApi.getImportStatus).toHaveBeenCalled();
  });
});
