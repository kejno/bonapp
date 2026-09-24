export interface AuthUser {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  fullName: string;
}

export interface LoginCredentials {
  login: string;
  password: string;
  totpCode?: string;
}

export interface LoginResponse {
  requiresTOTP?: true;
  accessToken?: string;
  user?: AuthUser;
}
