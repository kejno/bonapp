export interface AuthUserDto {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  fullName: string;
}

export interface LoginResponseDto {
  requiresTOTP?: true;
  accessToken?: string;
  user?: AuthUserDto;
}
