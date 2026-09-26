import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TenantRequest } from './tenant-context.guard';

const ADMIN_MENU_ROLES = new Set<UserRole>([
  UserRole.OWNER,
  UserRole.MANAGER,
  UserRole.SUPER_ADMIN,
]);

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.user?.role || !ADMIN_MENU_ROLES.has(request.user.role)) {
      throw new ForbiddenException('Administrative menu access is required');
    }
    return true;
  }
}
