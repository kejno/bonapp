export interface IikoConfig {
  login: string;
  password_encrypted: string;
  concept_id: string;
}

export interface IikoTokenResponse {
  token: string;
  ttl?: number;
}

export interface IikoGroup {
  id: string;
  name: string;
  isDeleted: boolean;
  parentGroup: string | null;
}

export interface IikoProduct {
  id: string;
  name: string;
  price: number;
  groupId: string | null;
  imageLinks: string[];
  isDeleted: boolean;
}

export interface IikoNomenclatureResponse {
  correlationId: string;
  groups: IikoGroup[];
  products: IikoProduct[];
}

export interface SyncStatusResponse {
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'UNAVAILABLE' | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}
