import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('menu tenant integrity (e2e)', () => {
  beforeAll(async () => {
    await prisma.modifierOption.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });
    await prisma.modifierGroup.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });
    await prisma.menuItem.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });
    await prisma.menuCategory.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });

    await prisma.tenant.createMany({
      data: [
        {
          id: 'menu-tenant-integrity-a',
          slug: 'menu-tenant-integrity-a',
          name: 'Menu tenant A',
        },
        {
          id: 'menu-tenant-integrity-b',
          slug: 'menu-tenant-integrity-b',
          name: 'Menu tenant B',
        },
      ],
    });
  });

  it('provides menu models through Prisma Client and rejects cross-tenant links', async () => {
    const categoryA = await prisma.menuCategory.create({
      data: {
        id: 'menu-tenant-integrity-category-a',
        tenantId: 'menu-tenant-integrity-a',
        name: 'Category A',
        sortOrder: 1,
      },
    });
    const categoryB = await prisma.menuCategory.create({
      data: {
        id: 'menu-tenant-integrity-category-b',
        tenantId: 'menu-tenant-integrity-b',
        name: 'Category B',
        sortOrder: 1,
      },
    });
    const itemA = await prisma.menuItem.create({
      data: {
        id: 'menu-tenant-integrity-item-a',
        tenantId: 'menu-tenant-integrity-a',
        categoryId: categoryA.id,
        name: 'Item A',
        priceByn: 1,
        allergens: [],
      },
    });

    await expect(
      prisma.menuItem.create({
        data: {
          id: 'menu-tenant-integrity-item-cross',
          tenantId: 'menu-tenant-integrity-a',
          categoryId: categoryB.id,
          name: 'Cross tenant item',
          priceByn: 1,
          allergens: [],
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.modifierGroup.create({
        data: {
          id: 'menu-tenant-integrity-group-cross',
          tenantId: 'menu-tenant-integrity-b',
          itemId: itemA.id,
          name: 'Cross tenant group',
        },
      }),
    ).rejects.toThrow();
  });

  afterAll(async () => {
    await prisma.modifierOption.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });
    await prisma.modifierGroup.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });
    await prisma.menuItem.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });
    await prisma.menuCategory.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { startsWith: 'menu-tenant-integrity-' } },
    });
    await prisma.$disconnect();
  });
});
