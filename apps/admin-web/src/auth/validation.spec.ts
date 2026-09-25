import { describe, expect, it } from 'vitest';
import {
  validateLogin,
  validatePassword,
  validateTotpCode,
} from './validation';

describe('validateLogin', () => {
  it('returns error for empty string', () => {
    expect(validateLogin('')).not.toBeNull();
    expect(validateLogin('   ')).not.toBeNull();
  });

  it('returns null for a valid email', () => {
    expect(validateLogin('admin@example.com')).toBeNull();
    expect(validateLogin('user.name+tag@sub.domain.org')).toBeNull();
  });

  it('returns null for a valid Belarus phone', () => {
    expect(validateLogin('+375291234567')).toBeNull();
    expect(validateLogin('+375331234567')).toBeNull();
    expect(validateLogin('+375441234567')).toBeNull();
  });

  it('returns error for a phone missing +375 prefix', () => {
    expect(validateLogin('375291234567')).not.toBeNull();
    expect(validateLogin('80291234567')).not.toBeNull();
  });

  it('returns error for a Belarus phone with wrong digit count', () => {
    expect(validateLogin('+37529123456')).not.toBeNull(); // 8 digits, need 9
    expect(validateLogin('+3752912345678')).not.toBeNull(); // 10 digits
  });

  it('returns error for an invalid email', () => {
    expect(validateLogin('not-an-email')).not.toBeNull();
    expect(validateLogin('@example.com')).not.toBeNull();
    expect(validateLogin('user@')).not.toBeNull();
  });
});

describe('validatePassword', () => {
  it('returns error for empty password', () => {
    expect(validatePassword('')).not.toBeNull();
  });

  it('returns null for any non-empty password', () => {
    expect(validatePassword('a')).toBeNull();
    expect(validatePassword('correct-horse-battery-staple')).toBeNull();
  });
});

describe('validateTotpCode', () => {
  it('returns error for empty code', () => {
    expect(validateTotpCode('')).not.toBeNull();
  });

  it('returns null for a valid 6-digit code', () => {
    expect(validateTotpCode('123456')).toBeNull();
    expect(validateTotpCode('000000')).toBeNull();
  });

  it('returns error for fewer than 6 digits', () => {
    expect(validateTotpCode('12345')).not.toBeNull();
  });

  it('returns error for more than 6 digits', () => {
    expect(validateTotpCode('1234567')).not.toBeNull();
  });

  it('returns error for non-numeric characters', () => {
    expect(validateTotpCode('12345a')).not.toBeNull();
    expect(validateTotpCode('abcdef')).not.toBeNull();
  });
});
