import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginRequest } from './auth.api';
import LoginPage from '../pages/LoginPage';

vi.mock('./auth.api', () => ({ loginRequest: vi.fn(), verifyTotpRequest: vi.fn() }));

describe('BNP-372 invalid credentials and form validation', () => {
  beforeEach(() => vi.mocked(loginRequest).mockReset());

  it('validates login and password and displays invalid password and locked account errors', async () => {
    render(<BrowserRouter><LoginPage /></BrowserRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Введите email или номер телефона')).toBeInTheDocument();
    expect(screen.getByText('Введите пароль')).toBeInTheDocument();
    expect(loginRequest).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Email или телефон'), { target: { value: '+375291234567' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'wrong' } });
    vi.mocked(loginRequest).mockRejectedValueOnce(new Error('Неверный логин или пароль'));
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Неверный логин или пароль')).toBeInTheDocument();

    vi.mocked(loginRequest).mockRejectedValueOnce(new Error('Аккаунт заблокирован'));
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Аккаунт заблокирован')).toBeInTheDocument();
  });
});
