export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  scope?: string;
}
