import { BadRequestException } from '@nestjs/common';

export function normalizeBelarusPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalizedDigits = digits.length === 9 ? `375${digits}` : digits.startsWith('80') && digits.length === 11 ? `375${digits.slice(2)}` : digits;
  if (!/^375(?:25|29|33|44)\d{7}$/.test(normalizedDigits)) {
    throw new BadRequestException('phone must be a valid Belarusian mobile number');
  }
  return `+${normalizedDigits}`;
}
