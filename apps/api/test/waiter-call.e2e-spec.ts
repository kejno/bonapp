import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TableSessionTokenService } from '../src/waiter-call/table-session-token.service';

describe('POST /api/v1/guest/call-waiter (e2e)', () => {
  let app: INestApplication;
  let socket: Socket;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        table: { findFirst: jest.fn().mockResolvedValue({ number: 4 }) },
      })
      .compile();

    app = module.createNestApplication();
    await app.listen(0);
  });

  afterEach(async () => {
    socket?.disconnect();
    await app?.close();
  });

  it('delivers the call to the authenticated tenant hall room', async () => {
    const tenantId = 'tenant-id';
    const tableId = 'table-id';
    const token = app.get(TableSessionTokenService).sign({ tenantId, tableId });

    socket = io(await app.getUrl(), { transports: ['websocket'] });
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    await new Promise<void>((resolve) =>
      socket.emit('hall:join', tenantId, resolve),
    );

    const event = new Promise<unknown>((resolve) =>
      socket.once('waiter:called', resolve),
    );
    await request(app.getHttpServer() as Server)
      .post('/api/v1/guest/call-waiter')
      .set('Cookie', `table_session=${token}`)
      .send({ reason: 'NEED_BILL', tableId: 'spoofed-table-id' })
      .expect(201);

    await expect(event).resolves.toEqual({
      tableId,
      tableNumber: 4,
      reason: 'NEED_BILL',
    });
  });
});
