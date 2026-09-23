import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TenantContextGuard } from './tenant-context.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, TenantContextGuard, AuthService],
  exports: [AuthGuard, TenantContextGuard],
})
export class AuthModule {}
