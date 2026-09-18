import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
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
    const tenantIdFromJwt = this.extractTenantId(token);

    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    if (headerTenantId && tenantIdFromJwt && headerTenantId !== tenantIdFromJwt) {
      throw new ForbiddenException('Tenant ID mismatch between JWT and X-Tenant-ID header');
    }

    if (tenantIdFromJwt) {
      this.tenantContextService.run(tenantIdFromJwt, () => next());
    } else {
      next();
    }
  }

  private extractTenantId(token: string): string | undefined {
    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) return undefined;
      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      const tenantId = payload['tenantId'];
      return typeof tenantId === 'string' ? tenantId : undefined;
    } catch {
      return undefined;
    }
  }
}
