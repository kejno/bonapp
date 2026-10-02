import { PrismaClient } from '@prisma/client';
import { createSeedOwnerPasswordHash } from '../src/prisma/seed-password';

const prisma = new PrismaClient();

const SEED_TENANT_ID = 'e1a7f3b0-0001-4000-a000-000000000001';
const AREA_ID = 'e1a7f3b0-0002-4000-a000-000000000001';
const CATEGORY_IDS = ['e1a7f3b0-0003-4000-a000-000000000001', 'e1a7f3b0-0003-4000-a000-000000000002', 'e1a7f3b0-0003-4000-a000-000000000003'];
const ITEM_IDS = ['e1a7f3b0-0004-4000-a000-000000000001', 'e1a7f3b0-0004-4000-a000-000000000002', 'e1a7f3b0-0004-4000-a000-000000000003', 'e1a7f3b0-0004-4000-a000-000000000004'];
const MODIFIER_GROUP_ID = 'e1a7f3b0-0005-4000-a000-000000000001';
const MODIFIER_IDS = ['e1a7f3b0-0006-4000-a000-000000000001', 'e1a7f3b0-0006-4000-a000-000000000002'];
const DEV_TABLES = [
  { number: 1, token: 'dev-table-1', label: 'Стол 1', seatsCount: 2 },
  { number: 2, token: 'dev-table-2', label: 'Стол 2', seatsCount: 4 },
  { number: 3, token: 'dev-table-3', label: 'Стол 3', seatsCount: 4 },
];

async function main() {
  const passwordHash = await createSeedOwnerPasswordHash(
    process.env.SEED_OWNER_PASSWORD ?? '',
  );

  const tenant = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.current_tenant_id', $1, true)",
      SEED_TENANT_ID,
    );

    const seededTenant = await tx.tenant.upsert({
      where: { id: SEED_TENANT_ID },
      create: {
        id: SEED_TENANT_ID,
        slug: 'le-bistro-gourmand',
        name: 'Le Bistro Gourmand',
      },
      update: {
        name: 'Le Bistro Gourmand',
      },
    });

    await tx.user.upsert({
      where: {
        tenantId_email: {
          tenantId: seededTenant.id,
          email: 'admin@lebistro.by',
        },
      },
      create: {
        tenantId: seededTenant.id,
        email: 'admin@lebistro.by',
        passwordHash,
        fullName: 'Le Bistro Gourmand Owner',
        role: 'OWNER',
      },
      update: {
        tenantId: seededTenant.id,
        passwordHash,
        role: 'OWNER',
      },
    });

    const area = await tx.diningArea.upsert({
      where: { id: AREA_ID },
      create: { id: AREA_ID, tenantId: seededTenant.id, name: 'Основной зал' },
      update: { tenantId: seededTenant.id, name: 'Основной зал', isActive: true },
    });

    for (const table of DEV_TABLES) {
      await tx.table.upsert({
        where: { qrToken: table.token },
        create: { tenantId: seededTenant.id, areaId: area.id, tableNumber: table.number, label: table.label, seatsCount: table.seatsCount, qrToken: table.token },
        update: { tenantId: seededTenant.id, areaId: area.id, tableNumber: table.number, label: table.label, seatsCount: table.seatsCount, status: 'AVAILABLE' },
      });
    }

    const categories = [
      { id: CATEGORY_IDS[0], name: 'Закуски', sortOrder: 1 },
      { id: CATEGORY_IDS[1], name: 'Основные блюда', sortOrder: 2 },
      { id: CATEGORY_IDS[2], name: 'Напитки', sortOrder: 3 },
    ];
    for (const category of categories) {
      await tx.menuCategory.upsert({
        where: { tenantId_id: { tenantId: seededTenant.id, id: category.id } },
        create: { ...category, tenantId: seededTenant.id },
        update: { name: category.name, sortOrder: category.sortOrder, isActive: true },
      });
    }

    const items = [
      { id: ITEM_IDS[0], categoryId: CATEGORY_IDS[0], name: 'Брускетта с томатами', description: 'Хрустящий хлеб, томаты и базилик', priceByn: '12.00', imageUrl: 'https://placehold.co/640x480?text=Bruschetta', allergens: ['GLUTEN'], sortOrder: 1 },
      { id: ITEM_IDS[1], categoryId: CATEGORY_IDS[1], name: 'Драники со сметаной', description: 'Картофельные драники со свежей сметаной', priceByn: '18.50', imageUrl: 'https://placehold.co/640x480?text=Draniki', allergens: ['EGGS', 'MILK'], sortOrder: 1 },
      { id: ITEM_IDS[2], categoryId: CATEGORY_IDS[1], name: 'Паста с грибами', description: 'Паста в сливочном соусе с белыми грибами', priceByn: '24.00', imageUrl: 'https://placehold.co/640x480?text=Pasta', allergens: ['GLUTEN', 'MILK'], sortOrder: 2 },
      { id: ITEM_IDS[3], categoryId: CATEGORY_IDS[2], name: 'Лимонад', description: 'Домашний лимонад, 300 мл', priceByn: '7.00', imageUrl: 'https://placehold.co/640x480?text=Lemonade', allergens: [], sortOrder: 1 },
    ];
    for (const item of items) {
      await tx.menuItem.upsert({
        where: { tenantId_id: { tenantId: seededTenant.id, id: item.id } },
        create: { ...item, tenantId: seededTenant.id, isInStopList: item.id === ITEM_IDS[2] },
        update: { ...item, isActive: true, isInStopList: item.id === ITEM_IDS[2] },
      });
    }

    const group = await tx.modifierGroup.upsert({
      where: { id_tenantId: { id: MODIFIER_GROUP_ID, tenantId: seededTenant.id } },
      create: { id: MODIFIER_GROUP_ID, tenantId: seededTenant.id, itemId: ITEM_IDS[1], name: 'Добавки', isRequired: false, minSelection: 0, maxSelection: 2 },
      update: { itemId: ITEM_IDS[1], name: 'Добавки', isActive: true, maxSelection: 2 },
    });
    for (const [index, modifier] of [{ name: 'Дополнительная сметана', price: '2.00' }, { name: 'Бекон', price: '4.00' }].entries()) {
      await tx.modifier.upsert({
        where: { id_tenantId: { id: MODIFIER_IDS[index], tenantId: seededTenant.id } },
        create: { id: MODIFIER_IDS[index], tenantId: seededTenant.id, modifierGroupId: group.id, name: modifier.name, price: modifier.price, sortOrder: index + 1 },
        update: { modifierGroupId: group.id, name: modifier.name, price: modifier.price, sortOrder: index + 1 },
      });
    }
    await tx.menuItemModifierGroup.upsert({
      where: { menuItemId_modifierGroupId: { menuItemId: ITEM_IDS[1], modifierGroupId: group.id } },
      create: { tenantId: seededTenant.id, menuItemId: ITEM_IDS[1], modifierGroupId: group.id },
      update: { tenantId: seededTenant.id },
    });
    await tx.stopListItem.upsert({
      where: { tenantId_menuItemId: { tenantId: seededTenant.id, menuItemId: ITEM_IDS[2] } },
      create: { tenantId: seededTenant.id, menuItemId: ITEM_IDS[2], isStopped: true },
      update: { isStopped: true },
    });

    return { tenant: seededTenant, tables: DEV_TABLES };
  });

  console.log(
    `Seed complete: tenant "${tenant.tenant.name}" (${tenant.tenant.id}), user admin@lebistro.by (OWNER)`,
  );
  console.log(`Dev tables: ${tenant.tables.map(({ number, token }) => `http://localhost:5173/t/${token} (стол ${number})`).join(', ')}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
