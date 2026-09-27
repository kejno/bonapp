import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { HallsService } from './halls.service';
import { TableQrPdfService } from './table-qr-pdf.service';
import { TablesController } from './tables.controller';

describe('GET /admin/tables for WAITER', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const tables = [
      { id: 'own-table', orders: [{ id: 'own-order', assignedWaiterId: 'waiter-1', status: 'NEW' }] },
      { id: 'other-table', orders: [{ id: 'other-order', assignedWaiterId: 'waiter-2', status: 'NEW' }] },
      { id: 'unassigned-table', orders: [] },
    ];
    const prisma = {
      forTenant: () => ({
        table: {
          findMany: jest.fn().mockImplementation((query: {
            where?: { orders?: { some?: { assignedWaiterId?: string } } };
            include?: { orders?: { where?: { assignedWaiterId?: string } } };
          }) => Promise.resolve(tables
            .filter((table) => !query.where?.orders?.some || table.orders.some(
              (order) => order.assignedWaiterId === query.where?.orders?.some?.assignedWaiterId,
            ))
            .map((table) => ({
              ...table,
              orders: table.orders.filter((order) =>
                !query.include?.orders?.where?.assignedWaiterId ||
                order.assignedWaiterId === query.include.orders.where.assignedWaiterId,
              ),
            })))),
        },
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [TablesController],
      providers: [
        HallsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TableQrPdfService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantContextGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = {
            tenantId: 'tenant-1',
            userId: 'waiter-1',
            role: 'WAITER',
          };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => app?.close());

  it('returns only the authenticated waiter’s assigned tables and orders', async () => {
    const response = await request(app.getHttpServer() as never)
      .get('/api/v1/admin/tables')
      .expect(200);
    const waiterTables = response.body as Array<{
      id: string;
      assignedWaiterId: string;
      orders: Array<{ id: string }>;
    }>;

    expect(waiterTables.map((table) => table.id)).toEqual(['own-table']);
    expect(waiterTables[0].orders.map((order) => order.id)).toEqual(['own-order']);
    expect(waiterTables[0].assignedWaiterId).toBe('waiter-1');
  });
});
