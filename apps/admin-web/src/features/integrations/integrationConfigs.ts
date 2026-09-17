export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'select';
  options?: { value: string; label: string }[];
}

export interface IntegrationConfig {
  provider: 'iiko' | 'r_keeper' | 'oplaty' | 'erip' | 'bepaid' | 'skno';
  title: string;
  fields: FieldConfig[];
}

export const INTEGRATION_CONFIGS: IntegrationConfig[] = [
  {
    provider: 'iiko',
    title: 'iiko Cloud',
    fields: [
      { key: 'iikoApiUrl', label: 'API URL', type: 'text' },
      { key: 'iikoLogin', label: 'Логин', type: 'text' },
      { key: 'iikoPassword', label: 'Пароль', type: 'password' },
    ],
  },
  {
    provider: 'r_keeper',
    title: 'r_keeper',
    fields: [
      { key: 'rKeeperApiUrl', label: 'API URL', type: 'text' },
      { key: 'rKeeperLogin', label: 'Логин', type: 'text' },
      { key: 'rKeeperPassword', label: 'Пароль', type: 'password' },
    ],
  },
  {
    provider: 'oplaty',
    title: 'Оплати™',
    fields: [
      { key: 'oplatyMerchantId', label: 'Merchant ID', type: 'text' },
      { key: 'oplatyApiKey', label: 'API Key', type: 'password' },
    ],
  },
  {
    provider: 'erip',
    title: 'ЕРИП E-POS',
    fields: [
      { key: 'eripServiceId', label: 'Service ID', type: 'text' },
      { key: 'eripSecret', label: 'Секрет', type: 'password' },
    ],
  },
  {
    provider: 'bepaid',
    title: 'bePaid',
    fields: [
      { key: 'bePaidShopId', label: 'Shop ID', type: 'text' },
      { key: 'bePaidSecretKey', label: 'Secret Key', type: 'password' },
      {
        key: 'bePaidMode',
        label: 'Режим',
        type: 'select',
        options: [
          { value: 'test', label: 'Test' },
          { value: 'prod', label: 'Production' },
        ],
      },
    ],
  },
  {
    provider: 'skno',
    title: 'СКНО «Титан-Плюс»',
    fields: [
      { key: 'sknoSerialNumber', label: 'Серийный номер', type: 'text' },
      { key: 'sknoHost', label: 'Хост', type: 'text' },
      { key: 'sknoPort', label: 'Порт', type: 'number' },
    ],
  },
];
