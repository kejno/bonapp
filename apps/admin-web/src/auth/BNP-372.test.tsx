import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginRequest } from './auth.api';
import { useAuthStore } from './auth.store';
import LoginPage from '../pages/LoginPage';

vi.mock('./auth.api', () => ({ loginRequest: vi.fn(), verifyTotpRequest: vi.fn() }));

describe('BNP-372 invalid credentials and form validation', () => {
  beforeEach(() => {
    vi.mocked(loginRequest).mockReset();
    useAuthStore.getState().clearAuth();
    window.history.pushState({}, '', '/login');
  });

  it('validates login and password and keeps failed login attempts unauthenticated on the login page', async () => {
    render(<BrowserRouter><LoginPage /></BrowserRouter>);

    fireEvent.change(screen.getByLabelText('Email или телефон'), { target: { value: 'invalid-email' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Введите корректный email или номер телефона в формате +375XXXXXXXXX')).toBeInTheDocument();
    expect(loginRequest).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Email или телефон'), { target: { value: '+37529123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Введите корректный email или номер телефона в формате +375XXXXXXXXX')).toBeInTheDocument();
    expect(loginRequest).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Email или телефон'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Введите пароль')).toBeInTheDocument();
    expect(loginRequest).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'wrong' } });
    vi.mocked(loginRequest).mockRejectedValueOnce(new Error('Неверный логин или пароль'));
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Неверный логин или пароль')).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(window.location.pathname).toBe('/login');

    vi.mocked(loginRequest).mockRejectedValueOnce(new Error('Аккаунт заблокирован'));
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Аккаунт заблокирован')).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(window.location.pathname).toBe('/login');
  });
});
