import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { verifyToken } from './staff-jwt.util';

export interface StaffRequest extends Request {
  staffUser?: {
    userId: string;
    tenantId: string;
    role: UserRole;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const token = this.extractBearer(request.headers.authorization);
    const payload = verifyToken(token, this.secret);

    if (payload.type !== 'access') {
      throw new UnauthorizedException();
    }

    request.staffUser = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    };

    const user = await this.prisma.forTenant(payload.tenantId).user.findFirst({
      where: { id: payload.userId, isActive: true, isBlocked: false },
      select: { isBlocked: true, mustChangePassword: true },
    });
    if (!user || user.isBlocked) throw new UnauthorizedException();
    if (user.mustChangePassword && context.getHandler().name !== 'changePassword') {
      throw new ForbiddenException('Password change required');
    }

    return true;
  }

  private extractBearer(authorization?: string): string {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException();
    return match[1];
  }
}
