import { Global, Module } from '@nestjs/common';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context.service';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [TenantContextService, TenantContextMiddleware, TenantGuard],
  exports: [TenantContextService, TenantContextMiddleware, TenantGuard],
})
export class TenantModule {}
