export type PosType = 'iiko' | 'r_keeper' | 'none';

export interface PosSettingsInput {
  posType: PosType;
  apiKey: string;
  appId?: string;
  clientSecret?: string;
  organizationId?: string;
  terminalGroupId?: string;
  url: string;
}

export function validatePosSettings(input: PosSettingsInput): Record<string, string> {
  if (input.posType === 'none') return {};
  const errors: Record<string, string> = {};
  if (!input.apiKey.trim()) errors.apiKey = 'Укажите API-ключ';
  if (input.posType === 'iiko') {
    if (!input.appId?.trim()) errors.appId = 'Укажите appId приложения';
    if (!input.clientSecret?.trim()) errors.clientSecret = 'Укажите clientSecret';
    if (!input.organizationId?.trim()) errors.organizationId = 'Укажите ID организации';
    if (!input.terminalGroupId?.trim()) errors.terminalGroupId = 'Укажите ID терминальной группы';
  }
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
