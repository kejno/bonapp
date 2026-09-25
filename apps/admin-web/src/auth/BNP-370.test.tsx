import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginRequest } from './auth.api';
import { useAuthStore } from './auth.store';
import App from '../App';

vi.mock('./auth.api', () => ({ loginRequest: vi.fn(), verifyTotpRequest: vi.fn() }));

describe('BNP-370 successful login', () => {
  beforeEach(() => {
    vi.mocked(loginRequest).mockReset();
    useAuthStore.getState().clearAuth();
    window.history.pushState({}, '', '/login');
  });

  it('stores the access token in memory and opens the dashboard after login', async () => {
    vi.mocked(loginRequest).mockResolvedValue({
      accessToken: 'access-token',
      user: { id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin' },
    });
    window.history.pushState({}, '', '/login');
    render(<App />);
    fireEvent.change(screen.getByLabelText('Email или телефон'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('access-token'));
    expect(await screen.findByRole('heading', { name: 'Добро пожаловать, Admin' })).toBeInTheDocument();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(loginRequest).toHaveBeenCalledWith({ login: 'admin@example.com', password: 'secret' });
  });
});
