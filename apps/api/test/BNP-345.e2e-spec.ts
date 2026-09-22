import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';

const repositoryRoot = resolve(__dirname, '../../..');
const databaseName = `bnp345_${randomUUID().replaceAll('-', '')}`;
let postgresContainer: string;
let databaseUrl: string;
let prisma: PrismaClient;

function docker(...args: string[]) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120_000,
  });
}

function psql(database: string, sql: string) {
  return docker(
    'exec',
    postgresContainer,
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  );
}

function migrate() {
  return execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'deploy',
      '--schema',
      'apps/api/prisma/schema.prisma',
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120_000,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );
}

describe('BNP-345: persisting an order with items and payment', () => {
  beforeAll(async () => {
    postgresContainer = docker(
      'run',
      '--detach',
      '--rm',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_DB=postgres',
      '--env',
      'POSTGRES_USER=postgres',
      '--env',
      'POSTGRES_PASSWORD=postgres',
      'postgres:15',
    ).trim();
    const port = docker('port', postgresContainer, '5432/tcp')
      .trim()
      .split(':')
      .at(-1);
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${databaseName}`;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        psql('postgres', 'SELECT 1');
        break;
      } catch {
        if (attempt === 29) throw new Error('PostgreSQL did not become ready');
        execFileSync('sleep', ['1']);
      }
    }
    psql('postgres', `CREATE DATABASE ${databaseName}`);
    migrate();
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.tenant.create({
      data: {
        id: 'bnp345-tenant',
        slug: 'bnp345-tenant',
        name: 'BNP-345 tenant',
      },
    });
    await prisma.diningArea.create({
      data: { id: 'bnp345-area', tenantId: 'bnp345-tenant', name: 'Main hall' },
    });
    await prisma.table.create({
      data: {
        id: 'bnp345-table',
        tenantId: 'bnp345-tenant',
        areaId: 'bnp345-area',
        tableNumber: 1,
        qrToken: 'bnp345-qr',
      },
    });
    await prisma.user.create({
      data: {
        id: 'bnp345-waiter',
        tenantId: 'bnp345-tenant',
        email: 'waiter@bnp345.test',
        passwordHash: 'not-used-in-test',
        fullName: 'BNP-345 Waiter',
        role: UserRole.WAITER,
      },
    });
    await prisma.menuCategory.create({
      data: {
        id: 'bnp345-category',
        tenantId: 'bnp345-tenant',
        name: 'Main menu',
        sortOrder: 0,
      },
    });
    await prisma.menuItem.create({
      data: {
        id: 'bnp345-menu-item',
        tenantId: 'bnp345-tenant',
        categoryId: 'bnp345-category',
        name: 'Test dish',
        priceByn: '12.75',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      psql('postgres', `DROP DATABASE IF EXISTS ${databaseName}`);
      docker('stop', postgresContainer);
    } catch {
      // Cleanup must not hide an assertion failure.
    }
  });

  it('stores and independently reads an order with its item and payment', async () => {
    await prisma.order.create({
      data: {
        id: 'bnp345-order',
        tenantId: 'bnp345-tenant',
        tableId: 'bnp345-table',
        dailyOrderNumber: 17,
        status: OrderStatus.NEW,
        guestSessionId: 'bnp345-guest-session',
        assignedWaiterId: 'bnp345-waiter',
        totalAmountByn: '25.50',
        tipsAmountByn: '2.50',
        paymentMethod: PaymentMethod.BANK_CARD,
        comment: 'No onions',
        items: {
          create: {
            id: 'bnp345-item',
            itemId: 'bnp345-menu-item',
            quantity: 2,
            unitPriceByn: '12.75',
            selectedModifiers: [{ id: 'extra-cheese' }],
            itemComment: 'Well done',
            status: 'COOKING',
            kitchenDepartment: 'hot',
          },
        },
        payments: {
          create: {
            id: 'bnp345-payment',
            amountByn: '25.50',
            tipsAmountByn: '2.50',
            provider: 'bank',
            providerTransactionId: 'transaction-1',
            eripOrderNumber: 'erip-order-1',
            status: PaymentStatus.SUCCEEDED,
            fiscalReceiptNumber: 'fiscal-receipt-1',
            payload: { receipt: '123' },
          },
        },
      },
    });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: 'bnp345-order' },
      include: { items: true, payments: true, assignedWaiter: true },
    });

    expect(order).toMatchObject({
      id: 'bnp345-order',
      status: OrderStatus.NEW,
      guestSessionId: 'bnp345-guest-session',
      assignedWaiterId: 'bnp345-waiter',
      paymentMethod: PaymentMethod.BANK_CARD,
      comment: 'No onions',
    });
    expect(order.createdAt).toBeInstanceOf(Date);
    expect(order.updatedAt).toBeInstanceOf(Date);
    expect(order.assignedWaiter).toMatchObject({
      id: 'bnp345-waiter',
      role: UserRole.WAITER,
    });
    expect(order.totalAmountByn.toString()).toBe('25.5');
    expect(order.tipsAmountByn.toString()).toBe('2.5');
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      id: 'bnp345-item',
      orderId: 'bnp345-order',
      itemId: 'bnp345-menu-item',
      quantity: 2,
      itemComment: 'Well done',
      kitchenDepartment: 'hot',
    });
    expect(order.items[0].unitPriceByn.toString()).toBe('12.75');
    expect(order.items[0].selectedModifiers).toEqual([{ id: 'extra-cheese' }]);
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0]).toMatchObject({
      id: 'bnp345-payment',
      orderId: 'bnp345-order',
      provider: 'bank',
      providerTransactionId: 'transaction-1',
      eripOrderNumber: 'erip-order-1',
      status: PaymentStatus.SUCCEEDED,
      fiscalReceiptNumber: 'fiscal-receipt-1',
      payload: { receipt: '123' },
    });
    expect(order.payments[0].amountByn.toString()).toBe('25.5');
    expect(order.payments[0].tipsAmountByn.toString()).toBe('2.5');
    expect(order.payments[0].createdAt).toBeInstanceOf(Date);
  }, 120_000);
});
