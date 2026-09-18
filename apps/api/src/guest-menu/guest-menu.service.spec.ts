import { ForbiddenException } from '@nestjs/common';
import { GuestMenuService } from './guest-menu.service';

describe('GuestMenuService', () => {
  const prisma = {
    tableSession: { findUnique: jest.fn() },
    menuCategory: { findMany: jest.fn() },
  };

  beforeEach(() => jest.resetAllMocks());

  it('returns active dishes in restaurant-defined order and marks stop-list items', async () => {
    prisma.tableSession.findUnique.mockResolvedValue({
      tenantId: 'tenant-1',
      table: { number: 12 },
      isActive: true,
      revokedAt: null,
      expiresAt: new Date('2099-01-01'),
    });
    prisma.menuCategory.findMany.mockResolvedValue([
      {
        id: 'category-1',
        name: 'Закуски',
        dishes: [
          {
            id: 'dish-1',
            name: 'Брускетта',
            description: 'С томатами',
            price: 1250,
            imageUrl: null,
            isHit: true,
            modifiers: [],
            stopListEntries: [{ id: 'stop-1' }],
          },
        ],
      },
      { id: 'category-2', name: 'Десерты', dishes: [] },
    ]);
    const service = new GuestMenuService(prisma as never);

    await expect(service.getMenu('valid-token')).resolves.toEqual({
      tableNumber: 12,
      categories: [
        {
          id: 'category-1',
          name: 'Закуски',
          dishes: [
            {
              id: 'dish-1',
              name: 'Брускетта',
              description: 'С томатами',
              price: 1250,
              imageUrl: null,
              isHit: true,
              isInStopList: true,
              modifiers: [],
            },
          ],
        },
        { id: 'category-2', name: 'Десерты', dishes: [] },
      ],
    });
    expect(prisma.menuCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        where: { tenantId: 'tenant-1', isActive: true },
      }),
    );
  });

  it('rejects a missing or expired table session token', async () => {
    prisma.tableSession.findUnique.mockResolvedValue(null);
    const service = new GuestMenuService(prisma as never);

    await expect(service.getMenu('expired-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
