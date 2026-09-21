import { Global, Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context.service';
import { TenantController } from './tenant.controller';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';

@Global()
@Module({
  imports: [StorageModule],
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
