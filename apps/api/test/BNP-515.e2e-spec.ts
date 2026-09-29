import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Prisma } from '@prisma/client';
import { encryptCredentials } from '../src/tenant/payment-credentials';
import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-515: отказ открытия смены при ошибке кассы', () => {
  const fixture = new StaffTestFixture();
  let cashRegister: Server;
  let cashRegisterHost: string;
  let state: Record<string, unknown> = { serial: 'TEST-SKNO', currZ: 10, err: [] };

  beforeAll(async () => {
    process.env.PAYMENT_CREDENTIALS_SECRET = 'bnp-515-test-secret';
    cashRegister = createServer((request, response) => {
      if (!request.headers.authorization) {
        response.writeHead(401, { 'WWW-Authenticate': 'Digest realm="HTROM", nonce="test", qop="auth", algorithm=MD5' }).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(state));
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

  it.each([
    ['ошибка кассы', { serial: 'TEST-SKNO', currZ: 10, err: 'x25' }],
    ['несовпадение серийного номера', { serial: 'OTHER-SKNO', currZ: 10, err: [] }],
  ])('оставляет смену закрытой при сценарии: %s', async (_scenario, reply) => {
    state = reply;
    const cashier = await fixture.createStaff();
    const encrypted = encryptCredentials({ gateway: 'skno', cashRegisterSerial: 'TEST-SKNO', host: cashRegisterHost, username: 'service', password: 'secret' }, process.env.PAYMENT_CREDENTIALS_SECRET!);
    await fixture.prisma.tenant.update({ where: { id: fixture.tenantId }, data: { paymentCredentials: { skno: encrypted as unknown as Prisma.InputJsonObject } } });

    await fixture.adminRequest().post('/api/v1/admin/shifts/open').send({ cashier_id: cashier.id }).expect(502);
    await fixture.adminRequest().get('/api/v1/admin/shifts/current').expect(200).expect(({ text }) => expect(text).toBe(''));
    expect(await fixture.prisma.shift.count({ where: { tenantId: fixture.tenantId } })).toBe(0);
  });
});
