import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { TenantContextGuard } from './tenant-context.guard';

@Module({
  providers: [AuthGuard, TenantContextGuard],
  exports: [AuthGuard, TenantContextGuard],
})
export class AuthModule {}
