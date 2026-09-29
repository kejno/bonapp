import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Prisma } from '@prisma/client';
import { tenantLocalDate } from '../src/orders/daily-order-number';
import { encryptCredentials } from '../src/tenant/payment-credentials';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-517: ошибка Z-отчёта не закрывает смену', () => {
  const fixture = new StaffTestFixture();
  let cashRegister: Server;
  let cashRegisterHost: string;

  beforeAll(async () => {
    process.env.PAYMENT_CREDENTIALS_SECRET = 'bnp-517-test-secret';
    cashRegister = createServer((request, response) => {
      if (!request.headers.authorization) {
        response.writeHead(401, { 'WWW-Authenticate': 'Digest realm="HTROM", nonce="test", qop="auth", algorithm=MD5' }).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      if (request.url === '/cgi/state') response.end(JSON.stringify({ serial: 'TEST-SKNO', currZ: 10, err: [] }));
      else if (request.url === '/cgi/tbl/FDay') response.end(JSON.stringify([{ id: 10 }]));
      else if (request.url === '/cgi/proc/printreport?0') response.end(JSON.stringify({ err: 'x25' }));
      else response.end(JSON.stringify({ err: [] }));
    });
    await new Promise<void>((resolve) => cashRegister.listen(0, '127.0.0.1', resolve));
    cashRegisterHost = `http://127.0.0.1:${(cashRegister.address() as AddressInfo).port}`;
    await fixture.startAsOwner();
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
    await new Promise<void>((resolve, reject) => cashRegister.close((error) => error ? reject(error) : resolve()));
    delete process.env.PAYMENT_CREDENTIALS_SECRET;
  });

  it('оставляет смену OPEN, отчёт отсутствует, счётчик не сбрасывается', async () => {
    const cashier = await fixture.createStaff();
    const encrypted = encryptCredentials({ gateway: 'skno', cashRegisterSerial: 'TEST-SKNO', host: cashRegisterHost, username: 'service', password: 'secret' }, process.env.PAYMENT_CREDENTIALS_SECRET!);
    await fixture.prisma.tenant.update({ where: { id: fixture.tenantId }, data: { paymentCredentials: { skno: encrypted as unknown as Prisma.InputJsonObject } } });
    const tenant = await fixture.prisma.tenant.findUniqueOrThrow({ where: { id: fixture.tenantId }, select: { timezone: true } });
    await fixture.prisma.tenant.update({ where: { id: fixture.tenantId }, data: { dailyOrderNumber: 17, dailyOrderNumberDate: tenantLocalDate(tenant.timezone) } });
    const openResponse = await fixture.adminRequest().post('/api/v1/admin/shifts/open').send({ cashier_id: cashier.id }).expect(201);
    const opened = openResponse.body as { id: string };

    await fixture.adminRequest().post('/api/v1/admin/shifts/close').expect(502);
    await fixture.adminRequest().get('/api/v1/admin/shifts/current').expect(200).expect(({ body }) => expect(body).toMatchObject({ id: opened.id, status: 'OPEN' }));
    expect(await fixture.prisma.shiftReport.count({ where: { tenantId: fixture.tenantId } })).toBe(0);
    const persistedTenant = await fixture.prisma.tenant.findUniqueOrThrow({ where: { id: fixture.tenantId }, select: { dailyOrderNumber: true } });
    expect(persistedTenant.dailyOrderNumber).toBe(17);
  });
});
