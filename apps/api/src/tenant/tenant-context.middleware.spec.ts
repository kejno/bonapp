import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context.service';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', process.env.JWT_SECRET ?? '')
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function buildReq(opts: { authorization?: string; xTenantId?: string }): Request {
  return {
    headers: {
      ...(opts.authorization !== undefined
        ? { authorization: opts.authorization }
        : {}),
      ...(opts.xTenantId !== undefined ? { 'x-tenant-id': opts.xTenantId } : {}),
    },
  } as Request;
}

const response = {} as Response;

describe('TenantContextMiddleware', () => {
  let service: TenantContextService;
  let middleware: TenantContextMiddleware;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    service = new TenantContextService();
    middleware = new TenantContextMiddleware(service);
  });

  it('calls next without a context when Authorization is absent', () => {
    const next: NextFunction = jest.fn();
    middleware.use(buildReq({}), response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets tenant context from a signed, unexpired JWT', () => {
    let tenantId: string | undefined;
    const next: NextFunction = () => {
      tenantId = service.getTenantId();
    };
    const token = makeJwt({
      tenantId: 'tenant-a',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    middleware.use(buildReq({ authorization: `Bearer ${token}` }), response, next);
    expect(tenantId).toBe('tenant-a');
  });

  it('rejects a token without exp', () => {
    const token = makeJwt({ tenantId: 'tenant-a' });
    expect(() =>
      middleware.use(
        buildReq({ authorization: `Bearer ${token}` }),
        response,
        jest.fn(),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects an expired token', () => {
    const token = makeJwt({
      tenantId: 'tenant-a',
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    expect(() =>
      middleware.use(
        buildReq({ authorization: `Bearer ${token}` }),
        response,
        jest.fn(),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a forged signature and a mismatched tenant header', () => {
    const token = makeJwt({
      tenantId: 'tenant-a',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const [header, , signature] = token.split('.');
    const payload = Buffer.from(
      JSON.stringify({ tenantId: 'tenant-b', exp: 9999999999 }),
    ).toString('base64url');
    expect(() =>
      middleware.use(
        buildReq({ authorization: `Bearer ${header}.${payload}.${signature}` }),
        response,
        jest.fn(),
      ),
    ).toThrow(UnauthorizedException);
    expect(() =>
      middleware.use(
        buildReq({ authorization: `Bearer ${token}`, xTenantId: 'tenant-b' }),
        response,
        jest.fn(),
      ),
    ).toThrow(ForbiddenException);
  });
});
