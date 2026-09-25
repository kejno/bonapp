import type { AuthUser as SharedAuthUser } from '@bonapp/shared-types';

export type AuthUser = SharedAuthUser;

export interface LoginCredentials {
  login: string;
  password: string;
  totpCode?: string;
}

export interface LoginResponse {
  requiresTOTP?: true;
  challenge?: string;
  accessToken?: string;
  user?: AuthUser;
}
