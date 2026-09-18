export enum IntegrationStatus {
  Online = 'Online',
  Offline = 'Offline',
  ConnectionFailed = 'ConnectionFailed',
  Active = 'Active',
  NotConfigured = 'NotConfigured',
}

export interface IikoIntegrationDto {
  status: IntegrationStatus;
  pingMs: number | null;
}

export interface RKeeperIntegrationDto {
  status: IntegrationStatus;
  pingMs: number | null;
}

export interface OplatyIntegrationDto {
  status: IntegrationStatus;
  merchantId: string | null;
}

export interface EripIntegrationDto {
  status: IntegrationStatus;
  serviceId: string | null;
}

export interface BePaidIntegrationDto {
  status: IntegrationStatus;
  shopId: string | null;
  mode: 'test' | 'prod' | null;
}

export interface SknoIntegrationDto {
  status: IntegrationStatus;
  serialNumber: string | null;
  pingMs: number | null;
}

export interface IntegrationsStatusResponseDto {
  iiko: IikoIntegrationDto;
  rKeeper: RKeeperIntegrationDto;
  oplaty: OplatyIntegrationDto;
  erip: EripIntegrationDto;
  bePaid: BePaidIntegrationDto;
  skno: SknoIntegrationDto;
}

export interface UpdateTenantSettingsDto {
  iikoApiUrl?: string;
  iikoLogin?: string;
  iikoPassword?: string;
  rKeeperApiUrl?: string;
  rKeeperLogin?: string;
  rKeeperPassword?: string;
  oplatyMerchantId?: string;
  oplatyApiKey?: string;
  eripServiceId?: string;
  eripSecret?: string;
  bePaidShopId?: string;
  bePaidSecretKey?: string;
  bePaidMode?: 'test' | 'prod';
  sknoSerialNumber?: string;
  sknoHost?: string;
  sknoPort?: number;
}
