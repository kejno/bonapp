import { Module } from '@nestjs/common';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AdminRoleGuard } from './admin-role.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TenantContextGuard } from './tenant-context.guard';

@Module({
  imports: [StaffAuthModule],
  controllers: [AuthController],
  providers: [AuthGuard, TenantContextGuard, AdminRoleGuard, AuthService],
  exports: [AuthGuard, TenantContextGuard, AdminRoleGuard, AuthService],
})
export class AuthModule {}
