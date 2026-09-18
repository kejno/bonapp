import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GuestService } from './guest.service';

describe('GuestService', () => {
  let service: GuestService;
  const prisma = {
    table: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [GuestService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(GuestService);
  });

  it('returns public session data for a table QR token', async () => {
    prisma.table.findUnique.mockResolvedValue({
      id: 'table-1',
      number: '7',
      tenant: {
        id: 'tenant-1',
        name: 'Bonapp Cafe',
        brandColor: '#123456',
        logoUrl: null,
      },
    });

    await expect(service.getSession('table-token')).resolves.toEqual({
      tenantId: 'tenant-1',
      tableId: 'table-1',
      tableNumber: '7',
      brandColor: '#123456',
      logoUrl: null,
      tenantName: 'Bonapp Cafe',
    });
    expect(prisma.table.findUnique).toHaveBeenCalledWith({
      where: { qrToken: 'table-token' },
      include: { tenant: true },
    });
  });

  it('rejects an unknown QR token', async () => {
    prisma.table.findUnique.mockResolvedValue(null);

    await expect(service.getSession('unknown')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
