import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context.service';
import { TenantController } from './tenant.controller';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';
import { GuestTenantController } from './guest-tenant.controller';
import { MenuModule } from '../menu/menu.module';

@Global()
@Module({
  imports: [AuthModule, StorageModule, MenuModule],
  controllers: [TenantController, GuestTenantController],
  providers: [
    TenantContextService,
    TenantContextMiddleware,
    TenantGuard,
    TenantService,
  ],
  exports: [TenantContextService, TenantContextMiddleware, TenantGuard, MenuModule],
})
export class TenantModule {}
