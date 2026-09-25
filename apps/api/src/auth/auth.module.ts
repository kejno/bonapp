import { Module } from '@nestjs/common';
import { AdminRoleGuard } from './admin-role.guard';
import { AuthGuard } from './auth.guard';
import { TenantContextGuard } from './tenant-context.guard';

@Module({
  providers: [AuthGuard, TenantContextGuard, AdminRoleGuard],
  exports: [AuthGuard, TenantContextGuard, AdminRoleGuard],
})
export class AuthModule {}
