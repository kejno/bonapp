import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context.service';
import { TenantController } from './tenant.controller';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';

@Global()
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [TenantController],
  providers: [
    TenantContextService,
    TenantContextMiddleware,
    TenantGuard,
    TenantService,
  ],
  exports: [TenantContextService, TenantContextMiddleware, TenantGuard],
})
export class TenantModule {}
