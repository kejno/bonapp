import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context.service';
import { TenantController } from './tenant.controller';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';
import { GuestTenantController } from './guest-tenant.controller';
import { MenuGateway } from '../menu/menu.gateway';

@Global()
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [TenantController, GuestTenantController],
  providers: [
    TenantContextService,
    TenantContextMiddleware,
    TenantGuard,
    TenantService,
    MenuGateway,
  ],
  exports: [TenantContextService, TenantContextMiddleware, TenantGuard, MenuGateway],
})
export class TenantModule {}
