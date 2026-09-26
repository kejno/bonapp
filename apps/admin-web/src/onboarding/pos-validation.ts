export type PosType = 'iiko' | 'r_keeper' | 'none';

export interface PosSettingsInput {
  posType: PosType;
  apiKey: string;
  url: string;
}

export function validatePosSettings(input: PosSettingsInput): Record<string, string> {
  if (input.posType === 'none') return {};
  const errors: Record<string, string> = {};
  if (!input.apiKey.trim()) errors.apiKey = 'Укажите API-ключ';
  if (!input.url.trim()) errors.url = 'Укажите URL POS-системы';
  else {
    try {
      const url = new URL(input.url);
      if (!['http:', 'https:'].includes(url.protocol)) errors.url = 'Укажите корректный URL';
    } catch {
      errors.url = 'Укажите корректный URL';
    }
  }
  return errors;
}
