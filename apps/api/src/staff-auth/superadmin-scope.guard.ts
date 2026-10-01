import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { StaffRequest } from './jwt-auth.guard';

@Injectable()
export class SuperadminScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    if (request.staffUser?.role !== UserRole.SUPER_ADMIN || request.staffUser.scope !== 'superadmin') {
      throw new ForbiddenException();
    }
    return true;
  }
}
