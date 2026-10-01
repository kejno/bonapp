import { ForbiddenException } from '@nestjs/common';
import { GuestSessionService } from './guest-session.service';

describe('GuestSessionService blocked tenants', () => {
  it('rejects opening a QR session for a blocked restaurant before creating a table session', async () => {
    const create = jest.fn();
    const prisma = {
      findTableByQrToken: jest.fn().mockResolvedValue({
        id: 'table-1', tenantId: 'tenant-1', tableNumber: 1,
        tenant: { id: 'tenant-1', status: 'BLOCKED', isActive: false }, area: { name: 'Зал' },
      }),
      unscopedClient: { tableSession: { create } },
    };
    const service = new GuestSessionService(prisma as never, {} as never, {} as never);

    await expect(service.resolveByQrToken('qr-token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });
});
