import request from 'supertest';
import { io as createSocket } from 'socket.io-client';
import type { Server } from 'node:http';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('BNP-419: guest order room', () => {
  const fixture = new MenuCacheTestFixture();
  beforeAll(async () => fixture.start(), 120_000);
  afterAll(async () => fixture.stop());

  it('joins the guest to the order room and receives a status change', async () => {
    const auth = { Authorization: `Bearer ${fixture.token()}` };
    const order = await request(fixture.app.getHttpServer()).post('/api/v1/admin/orders').set(auth)
      .send({ tableId: fixture.tableId, phone: '+375291234570' }).expect(201) as unknown as { body: { id: string } };
    await fixture.app.listen(0);
    const address = (fixture.app.getHttpServer() as unknown as Server).address();
    if (!address || typeof address === 'string') throw new Error('HTTP server address unavailable');
    const socket = createSocket(`http://127.0.0.1:${address.port}`, { transports: ['websocket'], auth: { qrToken: fixture.qrToken } });
    try {
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      await new Promise<void>((resolve, reject) => socket.emit('join_order_room', { orderId: order.body.id }, (result: { ok: boolean }) => result.ok ? resolve() : reject(new Error('Не удалось подключиться к комнате заказа'))));
      const event = new Promise<{ id: string; status: string }>((resolve) => socket.once('order:status_changed', resolve));
      await request(fixture.app.getHttpServer()).patch(`/api/v1/admin/orders/${order.body.id}/status`).set(auth).send({ status: 'COOKING' }).expect(200);
      await expect(event).resolves.toMatchObject({ id: order.body.id, status: 'COOKING' });
    } finally { socket.close(); }
  });
});
