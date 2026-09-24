import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TenantContextGuard } from './tenant-context.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthGuard, TenantContextGuard, AuthService],
  exports: [AuthGuard, TenantContextGuard, AuthService],
})
export class AuthModule {}
