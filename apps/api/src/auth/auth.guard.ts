import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedRequest extends Request {
  user?: {
    tenantId: string;
    userId?: string;
    role?: UserRole;
  };
}

interface JwtPayload {
  tenantId?: unknown;
  sub?: unknown;
  userId?: unknown;
  role?: unknown;
  exp?: unknown;
  type?: unknown;
  sessionVersion?: unknown;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly secret: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.getBearerToken(request.headers.authorization);
    const payload = this.verifyToken(token);
    request.user = {
      tenantId: payload.tenantId,
      ...(payload.userId ? { userId: payload.userId } : {}),
      ...(payload.role ? { role: payload.role } : {}),
    };

    const userId =
      payload.staffUserId ??
      (payload.tokenType === 'access' ? payload.userId : undefined) ??
      payload.userId;
    if (userId) {
      const user = await this.prisma.forTenant(payload.tenantId).user.findFirst({
        where: { id: userId, isActive: true, isBlocked: false },
        select: { mustChangePassword: true, sessionVersion: true, role: true },
      });
      const isLegacySubOnlyToken =
        !payload.staffUserId && payload.tokenType !== 'access';
      if (!user && !isLegacySubOnlyToken) throw new UnauthorizedException();
      if (user) request.user.role = user.role;
      if (
        user &&
        (payload.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)
      ) {
        throw new UnauthorizedException();
      }
      if (user?.mustChangePassword && request.path !== '/api/v1/auth/initial-password') {
        throw new ForbiddenException('Password change required');
      }
    }

    return true;
  }

  private getBearerToken(authorization?: string): string {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException();
    return match[1];
  }

  private verifyToken(token: string): {
    tenantId: string;
    userId?: string;
    staffUserId?: string;
    role?: UserRole;
    tokenType?: string;
    sessionVersion?: number;
  } {
    const [encodedHeader, encodedPayload, signature, ...extraParts] =
      token.split('.');
    if (
      !encodedHeader ||
      !encodedPayload ||
      !signature ||
      extraParts.length > 0
    ) {
      throw new UnauthorizedException();
    }

    try {
      const header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf8'),
      ) as { alg?: unknown };
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as JwtPayload;
      const expectedSignature = createHmac('sha256', this.secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest();
      const providedSignature = Buffer.from(signature, 'base64url');

      if (
        header.alg !== 'HS256' ||
        providedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(providedSignature, expectedSignature) ||
        typeof payload.tenantId !== 'string' ||
        !payload.tenantId.trim() ||
        payload.type === 'refresh' ||
        (typeof payload.exp === 'number' && payload.exp <= Date.now() / 1000)
      ) {
        throw new UnauthorizedException();
      }

      if (payload.sub !== undefined && (typeof payload.sub !== 'string' || !payload.sub.trim())) {
        throw new UnauthorizedException();
      }
      if (payload.userId !== undefined && (typeof payload.userId !== 'string' || !payload.userId.trim())) {
        throw new UnauthorizedException();
      }
      if (payload.type !== undefined && typeof payload.type !== 'string') {
        throw new UnauthorizedException();
      }
      if (
        payload.sessionVersion !== undefined &&
        (typeof payload.sessionVersion !== 'number' ||
          !Number.isInteger(payload.sessionVersion) ||
          payload.sessionVersion < 0)
      ) {
        throw new UnauthorizedException();
      }
      if (
        payload.role !== undefined &&
        (typeof payload.role !== 'string' ||
          !Object.values(UserRole).includes(payload.role as UserRole))
      ) {
        throw new UnauthorizedException();
      }

      return {
        tenantId: payload.tenantId,
        ...(typeof payload.sub === 'string' ? { userId: payload.sub } : {}),
        ...(typeof payload.userId === 'string' ? { staffUserId: payload.userId } : {}),
        ...(typeof payload.type === 'string' ? { tokenType: payload.type } : {}),
        ...(typeof payload.sessionVersion === 'number'
          ? { sessionVersion: payload.sessionVersion }
          : {}),
        ...(typeof payload.role === 'string'
          ? { role: payload.role as UserRole }
          : {}),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException();
    }
  }
}
