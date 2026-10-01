import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftService } from './shift.service';
import { encryptCredentials } from '../tenant/payment-credentials';

describe('ShiftService', () => {
  it('converts a concurrent open-shift unique conflict to HTTP 409', async () => {
    const prisma = {
      transactionForTenant: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    };
    const service = new ShiftService(prisma as unknown as PrismaService, { open: jest.fn(), close: jest.fn(), reconcileClose: jest.fn() });

    await expect(service.open('tenant-1', 'cashier-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects opening a second shift for a tenant with an active shift', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'shift-1' });
    const tx = { shift: { findFirst }, user: { findFirst: jest.fn() } };
    const transactionForTenant = jest.fn(
      (
        _tenantId: string,
        operation: (tx: {
          shift: { findFirst: () => Promise<unknown> };
          user: { findFirst: () => Promise<unknown> };
        }) => Promise<unknown>,
      ) =>
        operation(tx),
    );
    const prisma = { transactionForTenant } as unknown as PrismaService;
    const service = new ShiftService(prisma, { open: jest.fn(), close: jest.fn(), reconcileClose: jest.fn() });

    await expect(service.open('tenant-1', 'cashier-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });

  it('validates SKNO credentials before persisting a close-start marker', async () => {
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    delete process.env.PAYMENT_CREDENTIALS_SECRET;
    const transactionForTenant = jest.fn();
    const prisma = {
      transactionForTenant,
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: null }) } },
    } as unknown as PrismaService;
    const skno = { open: jest.fn(), close: jest.fn(), reconcileClose: jest.fn() };
    const service = new ShiftService(prisma, skno);

    try {
      await expect(service.close('tenant-1')).rejects.toThrow('Настройте зашифрованные реквизиты');
      expect(transactionForTenant).not.toHaveBeenCalled();
      expect(skno.close).not.toHaveBeenCalled();
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });

  it('rejects closing a shift while paid orders have unresolved fiscalization', async () => {
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = 'test-secret';
    const shift = { id: 'shift-1', tenantId: 'tenant-1', openedAt: new Date('2026-09-30T10:00:00Z'), sknoStartZ: 3 };
    const paymentCount = jest.fn().mockResolvedValue(2);
    const transactionForTenant = jest.fn((_tenantId: string, operation: (tx: unknown) => unknown) => Promise.resolve(operation({
      $executeRaw: jest.fn(),
      shift: { findFirst: jest.fn().mockResolvedValue(shift), update: jest.fn() },
      payment: { count: paymentCount },
    })));
    const prisma = {
      transactionForTenant,
      db: { tenant: { findUnique: jest.fn().mockResolvedValue({ paymentCredentials: { skno: encryptCredentials({ cashRegisterSerial: 'serial', host: 'http://cash.local', username: 'service', password: 'secret' }, 'test-secret') } }) } },
    } as unknown as PrismaService;
    const skno = { open: jest.fn(), close: jest.fn(), reconcileClose: jest.fn() };
    const service = new ShiftService(prisma, skno);

    try {
      await expect(service.close('tenant-1')).rejects.toMatchObject({
        status: 409,
        response: { unresolvedFiscalizations: 2 },
      });
      expect(paymentCount).toHaveBeenCalled();
      expect(skno.close).not.toHaveBeenCalled();
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
