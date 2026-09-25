const PHONE_RB = /^\+375\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLogin(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Введите email или номер телефона';
  if (!PHONE_RB.test(v) && !EMAIL_RE.test(v)) {
    return 'Введите корректный email или номер телефона в формате +375XXXXXXXXX';
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Введите пароль';
  return null;
}

export function validateTotpCode(value: string): string | null {
  if (!value) return 'Введите код из приложения';
  if (!/^\d{6}$/.test(value)) return 'Код должен состоять из 6 цифр';
  return null;
}
