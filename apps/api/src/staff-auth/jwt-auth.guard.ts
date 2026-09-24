import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
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

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  canActivate(context: ExecutionContext): boolean {
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
    return true;
  }

  private extractBearer(authorization?: string): string {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException();
    return match[1];
  }
}
