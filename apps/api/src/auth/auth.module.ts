import { Module } from '@nestjs/common';
import { AdminRoleGuard } from './admin-role.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TenantContextGuard } from './tenant-context.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, TenantContextGuard, AdminRoleGuard, AuthService],
  exports: [AuthGuard, TenantContextGuard, AdminRoleGuard, AuthService],
})
export class AuthModule {}
