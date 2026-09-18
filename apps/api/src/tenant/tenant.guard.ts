import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantContextService: TenantContextService) {}

  canActivate(_context: ExecutionContext): boolean {
    const tenantId = this.tenantContextService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return true;
  }
}
