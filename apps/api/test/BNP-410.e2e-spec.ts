import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Prisma } from '@prisma/client';
import { encryptCredentials } from '../src/tenant/payment-credentials';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-410: состояние смены', () => {
  const fixture = new StaffTestFixture();
  let cashRegister: Server;
  let cashRegisterHost: string;
  let reportCreated = false;

  beforeAll(async () => {
    const credentialsSecret = 'bnp-410-test-secret';
    process.env.PAYMENT_CREDENTIALS_SECRET = credentialsSecret;
    cashRegister = createServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (request.url === '/cgi/state') response.end(JSON.stringify({ serial: 'TEST-SKNO-410', currZ: reportCreated ? 11 : 10, err: [] }));
      else if (request.url === '/cgi/tbl/FDay') response.end(JSON.stringify(reportCreated ? [{ id: 10 }, { id: 11 }] : [{ id: 10 }]));
      else if (request.url === '/cgi/proc/printreport?0') { reportCreated = true; response.end(JSON.stringify({ err: [] })); }
      else response.end(JSON.stringify({ err: [] }));
    });
    await new Promise<void>((resolve) => cashRegister.listen(0, '127.0.0.1', resolve));
    cashRegisterHost = `http://127.0.0.1:${(cashRegister.address() as AddressInfo).port}`;
    await fixture.startAsOwner();
    const encrypted = encryptCredentials({ gateway: 'skno', cashRegisterSerial: 'TEST-SKNO-410', host: cashRegisterHost, username: 'service', password: 'secret' }, credentialsSecret);
    await fixture.prisma.tenant.update({ where: { id: fixture.tenantId }, data: { paymentCredentials: { skno: encrypted as unknown as Prisma.InputJsonObject } } });
  }, 120_000);
  afterAll(async () => {
    await fixture.stop();
    await new Promise<void>((resolve, reject) => cashRegister.close((error) => error ? reject(error) : resolve()));
    delete process.env.PAYMENT_CREDENTIALS_SECRET;
  });

  it('открывает смену, возвращает её как текущую и закрывает с итоговым отчётом', async () => {
    const cashier = await fixture.createStaff();
    const area = await fixture.prisma.diningArea.create({
      data: { tenantId: fixture.tenantId, name: 'Основной зал' },
    });
    const table = await fixture.prisma.table.create({
      data: {
        tenantId: fixture.tenantId,
        areaId: area.id,
        tableNumber: 1,
        qrToken: `shift-${fixture.tenantId}`,
      },
    });
    const openResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/open').send({ cashier_id: cashier.id }).expect(201);
    const opened = openResponse.body as { id: string; cashierId: string; status: string };
    expect(opened).toMatchObject({ cashierId: cashier.id, status: 'OPEN' });

    const currentResponse = await fixture.adminRequest().get('/api/v1/admin/shifts/current').expect(200);
    const current = currentResponse.body as { id: string; status: string; cashier: { id: string } };
    expect(current).toMatchObject({ id: opened.id, status: 'OPEN', cashier: { id: cashier.id } });

    await fixture.prisma.order.createMany({
      data: [40, 35.5, 50].map((totalAmountByn, index) => ({
        tenantId: fixture.tenantId,
        tableId: table.id,
        dailyOrderNumber: index + 1,
        totalAmountByn,
      })),
    });

    const closeResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/close').expect(201);
    const closed = closeResponse.body as {
      id: string;
      status: string;
      closedAt: string;
      report: { shiftId: string; cashierId: string; orderCount: number; totalAmount: string };
    };
    expect(closed).toMatchObject({
      id: opened.id,
      status: 'CLOSED',
      report: { shiftId: opened.id, cashierId: cashier.id, orderCount: 3, totalAmount: '125.5' },
    });
    expect(closed.closedAt).toBeTruthy();
    const currentAfterClose = await fixture.adminRequest().get('/api/v1/admin/shifts/current').expect(200);
    expect(currentAfterClose.text).toBe('');
  });
});
