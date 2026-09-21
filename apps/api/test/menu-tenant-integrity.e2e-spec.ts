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

  it('rejects negative menu prices at the database boundary', async () => {
    const category = await prisma.menuCategory.create({
      data: {
        id: 'menu-tenant-integrity-category-prices',
        tenantId: 'menu-tenant-integrity-a',
        name: 'Price category',
        sortOrder: 2,
      },
    });

    await expect(
      prisma.menuItem.create({
        data: {
          id: 'menu-tenant-integrity-item-negative-price',
          tenantId: 'menu-tenant-integrity-a',
          categoryId: category.id,
          name: 'Negative price item',
          priceByn: -1,
          allergens: [],
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.menuItem.create({
        data: {
          id: 'menu-tenant-integrity-item-negative-cost',
          tenantId: 'menu-tenant-integrity-a',
          categoryId: category.id,
          name: 'Negative cost item',
          priceByn: 1,
          costPriceByn: -1,
          allergens: [],
        },
      }),
    ).rejects.toThrow();

    const item = await prisma.menuItem.create({
      data: {
        id: 'menu-tenant-integrity-item-price-option',
        tenantId: 'menu-tenant-integrity-a',
        categoryId: category.id,
        name: 'Modifier item',
        priceByn: 1,
        allergens: [],
      },
    });
    const group = await prisma.modifierGroup.create({
      data: {
        id: 'menu-tenant-integrity-group-price-option',
        tenantId: 'menu-tenant-integrity-a',
        itemId: item.id,
        name: 'Price group',
      },
    });

    await expect(
      prisma.modifierOption.create({
        data: {
          id: 'menu-tenant-integrity-option-negative-price',
          groupId: group.id,
          name: 'Negative option',
          extraPriceByn: -1,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.menuItem.create({
        data: {
          id: 'menu-tenant-integrity-item-nan-price',
          tenantId: 'menu-tenant-integrity-a',
          categoryId: category.id,
          name: 'NaN price item',
          priceByn: NaN,
          allergens: [],
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.menuItem.create({
        data: {
          id: 'menu-tenant-integrity-item-nan-cost',
          tenantId: 'menu-tenant-integrity-a',
          categoryId: category.id,
          name: 'NaN cost item',
          priceByn: 1,
          costPriceByn: NaN,
          allergens: [],
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.modifierOption.create({
        data: {
          id: 'menu-tenant-integrity-option-nan-price',
          groupId: group.id,
          name: 'NaN option',
          extraPriceByn: NaN,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects invalid modifier selection ranges at the database boundary', async () => {
    const category = await prisma.menuCategory.create({
      data: {
        id: 'menu-tenant-integrity-category-selection',
        tenantId: 'menu-tenant-integrity-a',
        name: 'Selection category',
        sortOrder: 3,
      },
    });
    const item = await prisma.menuItem.create({
      data: {
        id: 'menu-tenant-integrity-item-selection',
        tenantId: 'menu-tenant-integrity-a',
        categoryId: category.id,
        name: 'Selection item',
        priceByn: 1,
        allergens: [],
      },
    });

    await expect(
      prisma.modifierGroup.create({
        data: {
          id: 'menu-tenant-integrity-group-negative-min',
          tenantId: 'menu-tenant-integrity-a',
          itemId: item.id,
          name: 'Negative minimum',
          minSelection: -1,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.modifierGroup.create({
        data: {
          id: 'menu-tenant-integrity-group-negative-max',
          tenantId: 'menu-tenant-integrity-a',
          itemId: item.id,
          name: 'Negative maximum',
          maxSelection: -1,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.modifierGroup.create({
        data: {
          id: 'menu-tenant-integrity-group-reversed-range',
          tenantId: 'menu-tenant-integrity-a',
          itemId: item.id,
          name: 'Reversed range',
          minSelection: 2,
          maxSelection: 1,
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
