import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginRequest, verifyTotpRequest } from '../auth/auth.api';
import LoginPage from './LoginPage';

vi.mock('../auth/auth.api', () => ({ loginRequest: vi.fn(), verifyTotpRequest: vi.fn() }));

const loginRequestMock = vi.mocked(loginRequest);
const verifyTotpRequestMock = vi.mocked(verifyTotpRequest);

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
    verifyTotpRequestMock.mockReset();
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

  it('verifies the one-time challenge returned by the compatible login endpoint', async () => {
    loginRequestMock.mockResolvedValueOnce({ challenge: 'challenge-1' });
    verifyTotpRequestMock.mockResolvedValueOnce({ accessToken: 'jwt', user: {
      id: 'u1', email: 'admin@example.com', role: 'OWNER', tenantId: 't1', fullName: 'Admin',
    } });
    renderLoginPage();

    submitCredentials();
    await screen.findByLabelText('Код подтверждения');
    fireEvent.change(screen.getByLabelText('Код подтверждения'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() => expect(verifyTotpRequestMock).toHaveBeenCalledWith('challenge-1', '123456'));
  });
});
