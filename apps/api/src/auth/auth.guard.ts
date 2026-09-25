import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: { tenantId: string; userId?: string; role?: string };
}

interface JwtPayload {
  tenantId?: unknown;
  userId?: unknown;
  role?: unknown;
  exp?: unknown;
  type?: unknown;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.getBearerToken(request.headers.authorization);
    const payload = this.verifyToken(token);
    request.user = { tenantId: payload.tenantId, userId: payload.userId, role: payload.role };
    return true;
  }

  private getBearerToken(authorization?: string): string {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException();
    return match[1];
  }

  private verifyToken(token: string): { tenantId: string; userId?: string; role?: string } {
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

      return {
        tenantId: payload.tenantId,
        userId:
          typeof payload.userId === 'string' ? payload.userId : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException();
    }
  }
}
