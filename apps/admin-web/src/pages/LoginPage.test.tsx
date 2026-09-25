import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginRequest } from '../auth/auth.api';
import LoginPage from './LoginPage';

vi.mock('../auth/auth.api', () => ({ loginRequest: vi.fn() }));

const loginRequestMock = vi.mocked(loginRequest);

function renderLoginPage() {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>,
  );
}

function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Email или телефон'), {
    target: { value: 'admin@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Пароль'), {
    target: { value: 'password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    loginRequestMock.mockReset();
  });

  it('shows an error when credentials response does not describe the next step', async () => {
    loginRequestMock.mockResolvedValue({});
    renderLoginPage();

    submitCredentials();

    expect(
      await screen.findByText('Неожиданный ответ сервера. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
  });

  it('shows an error when TOTP response lacks an authenticated user', async () => {
    loginRequestMock
      .mockResolvedValueOnce({ requiresTOTP: true })
      .mockResolvedValueOnce({});
    renderLoginPage();

    submitCredentials();
    await screen.findByLabelText('Код подтверждения');
    fireEvent.change(screen.getByLabelText('Код подтверждения'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() => {
      expect(
        screen.getByText('Неожиданный ответ сервера. Попробуйте ещё раз.'),
      ).toBeInTheDocument();
    });
  });
});
