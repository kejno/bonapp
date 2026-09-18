import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket } from 'socket.io-client';
import { OrderService } from '../src/realtime/order.service';
import { OrdersController } from '../src/realtime/orders.controller';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { StaffAuthService } from '../src/realtime/staff-auth.service';
import { TableSessionService } from '../src/realtime/table-session.service';

describe('RealtimeGateway (e2e)', () => {
  let app: INestApplication;
  let client: Socket;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        RealtimeGateway,
        {
          provide: TableSessionService,
          useValue: {
            validateOrderAccess: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: StaffAuthService,
          useValue: {
            authenticate: jest
              .fn()
              .mockReturnValue({ tenantId: 'tenant-1', role: 'kitchen' }),
          },
        },
        {
          provide: OrderService,
          useValue: {
            updateStatus: jest.fn().mockResolvedValue({
              id: 'order-1',
              tenantId: 'tenant-1',
              status: 'READY',
            }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0);
  });

  afterEach(async () => {
    client?.disconnect();
    await app.close();
  });

  it('delivers a PATCH status update to an authorized order room', async () => {
    const httpServer = app.getHttpServer() as unknown as {
      address(): { port: number };
    };
    const port = httpServer.address().port;
    client = io(`http://127.0.0.1:${port}`, {
      auth: { tableSessionToken: 'table-session-token' },
    });
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    await client.emitWithAck('join_order_room', { orderId: 'order-1' });
    const received = new Promise((resolve) =>
      client.once('order:status_changed', resolve),
    );

    await request(app.getHttpServer() as App)
      .patch('/orders/order-1/status')
      .set('Authorization', 'Bearer staff-token')
      .send({ status: 'READY' })
      .expect(200);

    await expect(received).resolves.toEqual({
      id: 'order-1',
      tenantId: 'tenant-1',
      status: 'READY',
    });
  });

  it('denies a guest without a table session token', async () => {
    const httpServer = app.getHttpServer() as unknown as {
      address(): { port: number };
    };
    const port = httpServer.address().port;
    client = io(`http://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });

    const rejected = new Promise((resolve) =>
      client.once('exception', resolve),
    );
    client.emit('join_order_room', { orderId: 'order-1' });
    await expect(rejected).resolves.toEqual(
      expect.objectContaining({ status: 'error' }),
    );
  });
});
