import { UnauthorizedException } from '@nestjs/common';
import { TableSessionTokenService } from './table-session-token.service';

describe('TableSessionTokenService', () => {
  const service = new TableSessionTokenService();

  beforeAll(() => {
    process.env.TABLE_SESSION_SECRET = 'test-secret';
  });

  it('returns the tenant and table encoded in a valid signed token', () => {
    const token = service.sign({ tenantId: 'tenant-id', tableId: 'table-id' });

    expect(service.verify(token)).toEqual({
      tenantId: 'tenant-id',
      tableId: 'table-id',
    });
  });

  it('rejects a token whose signature was changed', () => {
    const token = `${service.sign({ tenantId: 'tenant-id', tableId: 'table-id' })}x`;

    expect(() => service.verify(token)).toThrow(UnauthorizedException);
  });
});
