import request from 'supertest';
import { io as createSocket } from 'socket.io-client';
import type { Server } from 'node:http';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-426: order status changes', () => {
  const fixture = new MenuCacheTestFixture();

  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('advances a status, rejects a reverse transition, updates the table, and emits the guest event', async () => {
    const authorization = { Authorization: `Bearer ${fixture.token()}` };
    await fixture.app.listen(0);
    const address = (fixture.app.getHttpServer() as unknown as Server).address();
    if (!address || typeof address === 'string') throw new Error('HTTP server address unavailable');
    const created = await request(fixture.app.getHttpServer())
      .post('/api/v1/admin/orders')
      .set(authorization)
      .send({ tableId: fixture.tableId, phone: '+375291234567' })
      .expect(201) as unknown as { body: { id: string } };
    const socket = createSocket(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'], auth: { qrToken: fixture.qrToken },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      await new Promise<void>((resolve, reject) => {
        socket.emit('join_order_room', { orderId: created.body.id }, (result: { ok: boolean }) => {
          if (result.ok) resolve(); else reject(new Error('Гость не подключился к комнате заказа'));
        });
      });
      const event = new Promise<{ orderId: string; status: string }>((resolve) => socket.once('order:status_changed', resolve));
      await request(fixture.app.getHttpServer())
        .patch(`/api/v1/admin/orders/${created.body.id}/status`).set(authorization).send({ status: 'COOKING' }).expect(200);
      await expect(fixture.prisma.order.findUnique({ where: { id: created.body.id }, select: { status: true } }))
        .resolves.toEqual({ status: 'COOKING' });
      await expect(event).resolves.toMatchObject({ orderId: created.body.id, status: 'COOKING' });
      await request(fixture.app.getHttpServer())
        .patch(`/api/v1/admin/orders/${created.body.id}/status`).set(authorization).send({ status: 'NEW' }).expect(400);
      await expect(fixture.prisma.order.findUnique({ where: { id: created.body.id }, select: { status: true } }))
        .resolves.toEqual({ status: 'COOKING' });
      await request(fixture.app.getHttpServer())
        .patch(`/api/v1/admin/orders/${created.body.id}/status`).set(authorization).send({ status: 'READY' }).expect(200);
      await request(fixture.app.getHttpServer())
        .patch(`/api/v1/admin/orders/${created.body.id}/status`).set(authorization).send({ status: 'SERVED' }).expect(200);
      await expect(fixture.prisma.table.findUnique({ where: { id: fixture.tableId }, select: { status: true } }))
        .resolves.toEqual({ status: 'OCCUPIED' });
      await fixture.prisma.payment.create({ data: {
        tenantId: fixture.tenantId,
        orderId: created.body.id,
        amountByn: '0.00',
        provider: 'test-provider',
        status: 'SUCCEEDED',
      } });
      await request(fixture.app.getHttpServer())
        .patch(`/api/v1/admin/orders/${created.body.id}/status`)
        .set(authorization)
        .send({ status: 'PAID' })
        .expect(200);
      await expect(fixture.prisma.order.findUnique({ where: { id: created.body.id }, select: { status: true } }))
        .resolves.toEqual({ status: 'PAID' });
      await expect(fixture.prisma.table.findUnique({ where: { id: fixture.tableId }, select: { status: true } }))
        .resolves.toEqual({ status: 'AVAILABLE' });
    } finally {
      socket.close();
    }
  });
});
