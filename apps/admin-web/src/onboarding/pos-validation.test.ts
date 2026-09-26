import { describe, expect, it } from 'vitest';
import { validatePosSettings } from './pos-validation';

describe('validatePosSettings', () => {
  it('requires credentials for selected POS systems', () => {
    expect(validatePosSettings({ posType: 'iiko', apiKey: '', url: '' })).toEqual({
      apiKey: 'Укажите API-ключ',
      url: 'Укажите URL POS-системы',
    });
  });

  it('accepts valid POS credentials and allows skipping without POS', () => {
    expect(validatePosSettings({ posType: 'r_keeper', apiKey: 'key', url: 'https://pos.example' })).toEqual({});
    expect(validatePosSettings({ posType: 'none', apiKey: '', url: '' })).toEqual({});
  });

  it('rejects malformed POS URLs', () => {
    expect(validatePosSettings({ posType: 'iiko', apiKey: 'key', url: 'bad-url' })).toHaveProperty('url');
  });
});
