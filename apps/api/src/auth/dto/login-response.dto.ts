import type { AuthUser } from '@bonapp/shared-types';

export type AuthUserDto = AuthUser;

export interface LoginResponseDto {
  requiresTOTP?: true;
  accessToken?: string;
  user?: AuthUserDto;
}
