import { BadRequestException } from '@nestjs/common';
import { normalizeBelarusPhone } from './phone-number';

describe('normalizeBelarusPhone', () => {
  it('normalizes local, international and formatted Belarusian mobile numbers', () => {
    expect(normalizeBelarusPhone('29 123-45-67')).toBe('+375291234567');
    expect(normalizeBelarusPhone('+375 (33) 765 43 21')).toBe('+375337654321');
    expect(normalizeBelarusPhone('8 (044) 111-22-33')).toBe('+375441112233');
  });

  it('rejects empty and non-Belarusian numbers', () => {
    expect(() => normalizeBelarusPhone('')).toThrow(BadRequestException);
    expect(() => normalizeBelarusPhone('+1 202 555 0100')).toThrow(BadRequestException);
  });
});
