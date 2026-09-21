import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenantContextService: TenantContextService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skipTenantGuard = this.reflector.getAllAndOverride<boolean>(
      'skipTenantGuard',
      [context.getHandler(), context.getClass()],
    );
    if (skipTenantGuard) return true;

    const tenantId = this.tenantContextService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return true;
  }
}
