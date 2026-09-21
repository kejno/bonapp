import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly tenantContextService: TenantContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.slice(7);
    const tenantIdFromJwt = this.verifyAndExtractTenantId(token);

    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    if (
      headerTenantId &&
      tenantIdFromJwt &&
      headerTenantId !== tenantIdFromJwt
    ) {
      throw new ForbiddenException(
        'Tenant ID mismatch between JWT and X-Tenant-ID header',
      );
    }

    if (tenantIdFromJwt) {
      this.tenantContextService.run(tenantIdFromJwt, () => next());
    } else {
      next();
    }
  }

  private verifyAndExtractTenantId(token: string): string | undefined {
    try {
      const [headerBase64, payloadBase64, signatureBase64] = token.split('.');
      if (!headerBase64 || !payloadBase64 || !signatureBase64) {
        throw new UnauthorizedException('Invalid JWT');
      }

      const header = JSON.parse(
        Buffer.from(headerBase64, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      const secret = process.env.JWT_SECRET;
      if (header['alg'] !== 'HS256' || !secret) {
        throw new UnauthorizedException('Invalid JWT');
      }

      const expectedSignature = createHmac('sha256', secret)
        .update(`${headerBase64}.${payloadBase64}`)
        .digest();
      const actualSignature = Buffer.from(signatureBase64, 'base64url');
      if (
        actualSignature.length !== expectedSignature.length ||
        !timingSafeEqual(actualSignature, expectedSignature)
      ) {
        throw new UnauthorizedException('Invalid JWT');
      }

      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      const now = Math.floor(Date.now() / 1000);
      if (
        (typeof payload['exp'] === 'number' && payload['exp'] <= now) ||
        (typeof payload['nbf'] === 'number' && payload['nbf'] > now)
      ) {
        throw new UnauthorizedException('JWT is not active');
      }
      const tenantId = payload['tenantId'];
      return typeof tenantId === 'string' ? tenantId : undefined;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid JWT');
    }
  }
}
