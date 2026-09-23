import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const apiDirectory = resolve(__dirname, '..');
let container: string;
let prisma: PrismaClient;

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
}

describe('BNP-352: иерархия ModifierGroup → ModifierOption', () => {
  beforeAll(async () => {
    container = docker(
      'run',
      '--detach',
      '--rm',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD=postgres',
      'postgres:15',
    ).trim();
    const port = docker('port', container, '5432/tcp')
      .trim()
      .split(':')
      .at(-1)!;
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        docker('exec', container, 'pg_isready', '-U', 'postgres');
        break;
      } catch {
        if (attempt === 29) throw new Error('PostgreSQL did not become ready');
        execFileSync('sleep', ['1']);
      }
    }

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: apiDirectory,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (container) docker('stop', container);
  });

  it('создаёт иерархию и проверяет внешние ключи item_id и group_id', async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: 'bnp352-tenant', name: 'BNP-352 Tenant' },
    });
    const category = await prisma.menuCategory.create({
      data: { tenantId: tenant.id, name: 'Drinks', sortOrder: 1 },
    });
    const item = await prisma.menuItem.create({
      data: {
        tenantId: tenant.id,
        categoryId: category.id,
        name: 'Coffee',
        priceByn: '3.50',
      },
    });
    const group = await prisma.modifierGroup.create({
      data: {
        tenantId: tenant.id,
        itemId: item.id,
        name: 'Size',
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
      },
    });
    const option = await prisma.modifierOption.create({
      data: {
        groupId: group.id,
        name: 'Large',
        extraPriceByn: '0.75',
        isDefault: false,
      },
    });

    const persistedOption = await prisma.modifierOption.findUniqueOrThrow({
      where: { id: option.id },
    });
    expect(persistedOption.groupId).toBe(group.id);
    expect(persistedOption.extraPriceByn.toString()).toBe('0.75');

    const persistedGroup = await prisma.modifierGroup.findUniqueOrThrow({
      where: { id: group.id },
      include: { modifierOptions: true },
    });
    expect(persistedGroup.itemId).toBe(item.id);
    expect(persistedGroup.modifierOptions).toHaveLength(1);
    expect(persistedGroup.isRequired).toBe(true);
    expect(persistedGroup.minSelection).toBe(1);
    expect(persistedGroup.maxSelection).toBe(1);

    // FK violation: item_id references non-existent menu item
    await expect(
      prisma.modifierGroup.create({
        data: {
          tenantId: tenant.id,
          itemId: 'non-existent-item',
          name: 'Invalid group',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    // FK violation: group_id references non-existent modifier group
    await expect(
      prisma.modifierOption.create({
        data: {
          groupId: 'non-existent-group',
          name: 'Invalid option',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  }, 120_000);
});
