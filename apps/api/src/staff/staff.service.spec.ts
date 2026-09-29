import { BadRequestException } from '@nestjs/common';
import { StaffService } from './staff.service';

describe('StaffService', () => {
  const tenantId = 'tenant-1';
  const prisma = {
    forTenant: jest.fn(),
    db: {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    },
    transactionForTenant: jest.fn(),
  };
  let service: StaffService;
  let createData: Record<string, unknown> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    createData = undefined;
    prisma.forTenant.mockReturnValue({
      user: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          createData = data;
          return Promise.resolve({
            id: 'staff-1',
            fullName: data['fullName'],
            email: data['email'],
            role: data['role'],
            phone: data['phone'],
            isActive: data['isActive'],
            createdAt: new Date(),
          });
        }),
      },
    });
    service = new StaffService(prisma as never);
  });

  it('creates a staff member with an allowed role and a hashed PIN', async () => {
    const result = await service.create(tenantId, {
      full_name: 'Иван Иванов',
      email: 'ivan@example.com',
      phone: '+375291234567',
      role: 'CASHIER',
      pin_code: '1234',
    });
    expect(result).not.toHaveProperty('pinHash');
    expect(createData?.['pinHash']).not.toBe('1234');
  });

  it('rejects roles outside the MVP enum', async () => {
    await expect(
      service.create(tenantId, {
        full_name: 'Иван Иванов',
        email: 'ivan@example.com',
        role: 'ADMIN',
        pin_code: '1234',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assigns valid kitchen departments to a chef through staff management', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'chef-1',
      kitchenDepartments: ['HOT', 'BAR'],
    });
    prisma.forTenant.mockReturnValue({
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'chef-1' }),
        update,
      },
    });

    await expect(
      service.updateKitchenDepartments(tenantId, 'chef-1', ['HOT', 'BAR']),
    ).resolves.toEqual({ id: 'chef-1', kitchenDepartments: ['HOT', 'BAR'] });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'chef-1' },
      data: { kitchenDepartments: ['HOT', 'BAR'] },
      select: { id: true, kitchenDepartments: true },
    });
  });

  it('rejects unknown kitchen departments', async () => {
    await expect(
      service.updateKitchenDepartments(tenantId, 'chef-1', ['DESSERT']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
