/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { NotFoundException } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { StaffService } from './staff.service';

describe('StaffService', () => {
  const tenantId = 'tenant-1';
  const staff = {
    id: 'staff-1',
    tenantId,
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+375291234567',
    role: StaffRole.CASHIER,
    pinHash: 'hash',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let prisma: any;
  let service: StaffService;

  beforeEach(() => {
    prisma = {
      staff: {
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new StaffService(prisma);
  });

  it('returns every staff member belonging to the tenant', async () => {
    prisma.staff.findMany.mockResolvedValue([
      staff,
      { ...staff, id: 'staff-2' },
    ]);

    await expect(service.findAll(tenantId)).resolves.toHaveLength(2);
    expect(prisma.staff.findMany).toHaveBeenCalledWith({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: expect.any(Object),
    });
  });

  it('creates a staff member with a hashed PIN and never returns it', async () => {
    prisma.staff.create.mockResolvedValue(staff);

    const result = await service.create(tenantId, {
      full_name: staff.fullName,
      email: staff.email,
      phone: staff.phone,
      role: StaffRole.CASHIER,
      pin_code: '1234',
      is_active: true,
    });

    expect(prisma.staff.create.mock.calls[0][0].data.pinHash).not.toBe('1234');
    expect(result).not.toHaveProperty('pinHash');
  });

  it('generates and returns a new four digit PIN only on reset', async () => {
    prisma.staff.findFirst.mockResolvedValue(staff);
    prisma.staff.update.mockResolvedValue(staff);
    jest.spyOn(Math, 'random').mockReturnValue(0.1234);

    await expect(service.resetPin(tenantId, staff.id)).resolves.toEqual({
      new_pin: '2110',
    });
    expect(prisma.staff.update.mock.calls[0][0].data.pinHash).not.toBe('2110');
  });

  it('does not reset a staff member from another tenant', async () => {
    prisma.staff.findFirst.mockResolvedValue(null);

    await expect(service.resetPin(tenantId, staff.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
