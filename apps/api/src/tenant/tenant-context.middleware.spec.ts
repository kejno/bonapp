import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantContextService } from './tenant-context.service';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', process.env.JWT_SECRET!)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function buildReq(opts: { authorization?: string; xTenantId?: string }): any {
  return {
    headers: {
      ...(opts.authorization !== undefined && {
        authorization: opts.authorization,
      }),
      ...(opts.xTenantId !== undefined && { 'x-tenant-id': opts.xTenantId }),
    },
  };
}

describe('TenantContextMiddleware', () => {
  let service: TenantContextService;
  let middleware: TenantContextMiddleware;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    service = new TenantContextService();
    middleware = new TenantContextMiddleware(service);
  });

  it('calls next without tenant context when no Authorization header', () => {
    const next = jest.fn();
    middleware.use(buildReq({}), {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(service.getTenantId()).toBeUndefined();
  });

  it('calls next without tenant context when Authorization is not Bearer', () => {
    const next = jest.fn();
    middleware.use(
      buildReq({ authorization: 'Basic abc123' }),
      {} as any,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(service.getTenantId()).toBeUndefined();
  });

  it('calls next without tenant context when JWT has no tenantId claim', () => {
    const next = jest.fn();
    const token = makeJwt({ sub: 'user-1', email: 'user@example.com' });
    middleware.use(
      buildReq({ authorization: `Bearer ${token}` }),
      {} as any,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(service.getTenantId()).toBeUndefined();
  });

  it('sets tenant context from JWT tenantId claim', () => {
    let capturedTenantId: string | undefined;
    const next = jest.fn().mockImplementation(() => {
      capturedTenantId = service.getTenantId();
    });
    const token = makeJwt({ tenantId: 'tenant-xyz', sub: 'user-1' });
    middleware.use(
      buildReq({ authorization: `Bearer ${token}` }),
      {} as any,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(capturedTenantId).toBe('tenant-xyz');
  });

  it('throws ForbiddenException when X-Tenant-ID differs from JWT tenantId', () => {
    const next = jest.fn();
    const token = makeJwt({ tenantId: 'tenant-a', sub: 'user-1' });
    expect(() =>
      middleware.use(
        buildReq({ authorization: `Bearer ${token}`, xTenantId: 'tenant-b' }),
        {} as any,
        next,
      ),
    ).toThrow(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts matching X-Tenant-ID header and sets tenant context', () => {
    let capturedTenantId: string | undefined;
    const next = jest.fn().mockImplementation(() => {
      capturedTenantId = service.getTenantId();
    });
    const token = makeJwt({ tenantId: 'tenant-a', sub: 'user-1' });
    middleware.use(
      buildReq({ authorization: `Bearer ${token}`, xTenantId: 'tenant-a' }),
      {} as any,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(capturedTenantId).toBe('tenant-a');
  });

  it('rejects a token whose payload was changed without a matching signature', () => {
    const next = jest.fn();
    const token = makeJwt({ tenantId: 'tenant-a', sub: 'user-1' });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ tenantId: 'tenant-b' }),
    ).toString('base64url');
    expect(() =>
      middleware.use(
        buildReq({
          authorization: `Bearer ${header}.${forgedPayload}.${signature}`,
        }),
        {} as any,
        next,
      ),
    ).toThrow(UnauthorizedException);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a malformed JWT instead of treating it as an anonymous request', () => {
    const next = jest.fn();
    expect(() =>
      middleware.use(
        buildReq({ authorization: 'Bearer invalid.not-base64.sig' }),
        {} as any,
        next,
      ),
    ).toThrow(UnauthorizedException);
    expect(next).not.toHaveBeenCalled();
  });
});
