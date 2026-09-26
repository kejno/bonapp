import { describe, expect, it } from 'vitest';
import { isValidSlug, isValidUnp } from './onboarding-validation';

describe('onboarding validation', () => {
  it('accepts a nine-digit UNP and rejects other values', () => {
    expect(isValidUnp('123456789')).toBe(true);
    expect(isValidUnp('12345678')).toBe(false);
    expect(isValidUnp('12345678a')).toBe(false);
  });

  it('accepts only lowercase latin slug characters in the supported length', () => {
    expect(isValidSlug('cafe-123')).toBe(true);
    expect(isValidSlug('ABc')).toBe(false);
    expect(isValidSlug('абв')).toBe(false);
    expect(isValidSlug('ab')).toBe(false);
  });
});
