import { UserRole } from '@prisma/client';

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshDto {
  refreshToken: string;
}

export interface LogoutDto {
  refreshToken: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends TokenPair {
  mustChangePassword: boolean;
}

export interface StaffJwtPayload {
  sub: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  type: 'access' | 'refresh';
  jti: string;
  sessionVersion?: number;
  exp: number;
  iat: number;
}
