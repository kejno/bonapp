import { Module } from '@nestjs/common';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { SuperadminScopeGuard } from './superadmin-scope.guard';

@Module({
  controllers: [StaffAuthController],
  providers: [StaffAuthService, JwtAuthGuard, RolesGuard, SuperadminScopeGuard],
  exports: [JwtAuthGuard, RolesGuard, SuperadminScopeGuard, StaffAuthService],
})
export class StaffAuthModule {}
