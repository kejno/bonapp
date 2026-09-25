import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginRequest, verifyTotpRequest } from './auth.api';
import { useAuthStore } from './auth.store';
import App from '../App';

vi.mock('./auth.api', () => ({ loginRequest: vi.fn(), verifyTotpRequest: vi.fn() }));

describe('BNP-373 TOTP verification', () => {
  beforeEach(() => {
    vi.mocked(loginRequest).mockReset();
    vi.mocked(verifyTotpRequest).mockReset();
    useAuthStore.getState().clearAuth();
  });

  it('rejects an invalid code and completes login with a valid six-digit code', async () => {
    vi.mocked(loginRequest).mockResolvedValueOnce({ challenge: 'challenge-1' });
    vi.mocked(verifyTotpRequest)
      .mockRejectedValueOnce(new Error('Неверный код подтверждения'))
      .mockResolvedValueOnce({ accessToken: 'access-token', user: {
        id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin',
      } });
    window.history.pushState({}, '', '/login');
    render(<App />);
    fireEvent.change(screen.getByLabelText('Email или телефон'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    const codeInput = await screen.findByLabelText('Код подтверждения');
    fireEvent.change(codeInput, { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(await screen.findByText('Код должен состоять из 6 цифр')).toBeInTheDocument();
    expect(verifyTotpRequest).not.toHaveBeenCalled();

    fireEvent.change(codeInput, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(await screen.findByText('Неверный код подтверждения')).toBeInTheDocument();
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('access-token'));
    expect(screen.getByRole('heading', { name: 'Добро пожаловать, Admin' })).toBeInTheDocument();
    expect(verifyTotpRequest).toHaveBeenLastCalledWith('challenge-1', '123456');
  });
});
