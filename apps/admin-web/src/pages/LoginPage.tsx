import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginRequest } from '../auth/auth.api';
import { useAuthStore } from '../auth/auth.store';
import type { AuthUser } from '../auth/auth.types';
import {
  validateLogin,
  validatePassword,
  validateTotpCode,
} from '../auth/validation';

type Step = 'credentials' | 'totp';

interface FieldErrors {
  login?: string;
  password?: string;
  totpCode?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState<Step>('credentials');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    const loginErr = validateLogin(login);
    const passwordErr = validatePassword(password);
    if (loginErr || passwordErr) {
      setErrors({ login: loginErr ?? undefined, password: passwordErr ?? undefined });
      return;
    }
    setErrors({});
    setServerError('');
    setLoading(true);
    try {
      const result = await loginRequest({ login: login.trim(), password });
      if (result.requiresTOTP) {
        setStep('totp');
        return;
      }
      if (result.accessToken && result.user) {
        setAuth(result.accessToken, result.user as AuthUser);
        navigate('/dashboard');
      } else {
        setServerError('Неожиданный ответ сервера. Попробуйте ещё раз.');
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  async function handleTotpSubmit(e: FormEvent) {
    e.preventDefault();
    const codeErr = validateTotpCode(totpCode);
    if (codeErr) {
      setErrors({ totpCode: codeErr });
      return;
    }
    setErrors({});
    setServerError('');
    setLoading(true);
    try {
      const result = await loginRequest({
        login: login.trim(),
        password,
        totpCode,
      });
      if (result.accessToken && result.user) {
        setAuth(result.accessToken, result.user as AuthUser);
        navigate('/dashboard');
      } else {
        setServerError('Неожиданный ответ сервера. Попробуйте ещё раз.');
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-on-background font-sans">
            Bonapp
          </h1>
          <p className="mt-1 text-sm text-on-background/60">
            {step === 'credentials'
              ? 'Войдите в панель управления'
              : 'Введите код из приложения-аутентификатора'}
          </p>
        </div>

        <div className="rounded-xl bg-surface-card p-8 shadow-sm border border-outline-variant/30">
          {step === 'credentials' ? (
            <form onSubmit={handleCredentialsSubmit} noValidate>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="login"
                    className="block text-sm font-medium text-on-surface mb-1.5"
                  >
                    Email или телефон
                  </label>
                  <input
                    id="login"
                    type="text"
                    autoComplete="username"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="admin@example.com или +375291234567"
                    className={`w-full rounded-lg border px-3.5 py-2.5 text-sm bg-surface text-on-surface placeholder:text-on-surface/40 outline-none transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                      errors.login
                        ? 'border-error'
                        : 'border-outline-variant focus:border-primary'
                    }`}
                  />
                  {errors.login && (
                    <p className="mt-1.5 text-xs text-error">{errors.login}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-on-surface mb-1.5"
                  >
                    Пароль
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full rounded-lg border px-3.5 py-2.5 text-sm bg-surface text-on-surface placeholder:text-on-surface/40 outline-none transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                      errors.password
                        ? 'border-error'
                        : 'border-outline-variant focus:border-primary'
                    }`}
                  />
                  {errors.password && (
                    <p className="mt-1.5 text-xs text-error">
                      {errors.password}
                    </p>
                  )}
                </div>
              </div>

              {serverError && (
                <div className="mt-4 rounded-lg bg-error-container px-3.5 py-2.5 text-sm text-on-error-container">
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Входим…' : 'Войти'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleTotpSubmit} noValidate>
              <div>
                <label
                  htmlFor="totpCode"
                  className="block text-sm font-medium text-on-surface mb-1.5"
                >
                  Код подтверждения
                </label>
                <input
                  id="totpCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) =>
                    setTotpCode(e.target.value.replace(/\D/g, ''))
                  }
                  placeholder="000000"
                  className={`w-full rounded-lg border px-3.5 py-2.5 text-sm bg-surface text-on-surface placeholder:text-on-surface/40 outline-none text-center tracking-[0.5em] font-mono transition-colors focus:ring-2 focus:ring-primary/30 focus:border-primary ${
                    errors.totpCode
                      ? 'border-error'
                      : 'border-outline-variant focus:border-primary'
                  }`}
                />
                {errors.totpCode && (
                  <p className="mt-1.5 text-xs text-error">{errors.totpCode}</p>
                )}
              </div>

              {serverError && (
                <div className="mt-4 rounded-lg bg-error-container px-3.5 py-2.5 text-sm text-on-error-container">
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Проверяем…' : 'Подтвердить'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('credentials');
                  setTotpCode('');
                  setErrors({});
                  setServerError('');
                }}
                className="mt-3 w-full text-sm text-on-surface/60 hover:text-on-surface transition-colors"
              >
                ← Назад
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
