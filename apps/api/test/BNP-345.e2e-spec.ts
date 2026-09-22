import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
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
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      psql('postgres', `DROP DATABASE IF EXISTS ${databaseName}`);
      docker('stop', postgresContainer);
    } catch {
      // Cleanup must not hide an assertion failure.
    }
  });

  it('stores the order, its item and payment with all supplied values', async () => {
    const order = await prisma.order.create({
      data: {
        id: 'bnp345-order',
        tenantId: 'bnp345-tenant',
        tableId: 'bnp345-table',
        dailyOrderNumber: 17,
        status: OrderStatus.COOKING,
        totalAmountByn: '25.50',
        tipsAmountByn: '2.50',
        paymentMethod: PaymentMethod.BANK_CARD,
        comment: 'No onions',
        items: {
          create: {
            id: 'bnp345-item',
            itemId: 'menu-item-1',
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
            status: PaymentStatus.SUCCEEDED,
            payload: { receipt: '123' },
          },
        },
      },
      include: { items: true, payments: true },
    });

    expect(order).toMatchObject({
      id: 'bnp345-order',
      status: OrderStatus.COOKING,
      paymentMethod: PaymentMethod.BANK_CARD,
      comment: 'No onions',
    });
    expect(order.totalAmountByn.toString()).toBe('25.5');
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      id: 'bnp345-item',
      itemId: 'menu-item-1',
      quantity: 2,
      itemComment: 'Well done',
      kitchenDepartment: 'hot',
    });
    expect(order.items[0].selectedModifiers).toEqual([{ id: 'extra-cheese' }]);
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0]).toMatchObject({
      id: 'bnp345-payment',
      provider: 'bank',
      providerTransactionId: 'transaction-1',
      status: PaymentStatus.SUCCEEDED,
      payload: { receipt: '123' },
    });
    expect(order.payments[0].amountByn.toString()).toBe('25.5');
  });
});
