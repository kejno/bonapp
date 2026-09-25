import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

export interface TenantRequest extends Request {
  user?: {
    tenantId?: string;
    userId?: string;
    role?: UserRole;
  };
}

@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.user?.tenantId) {
      throw new UnauthorizedException('Authenticated tenant context is required');
    }
    return true;
  }
}
