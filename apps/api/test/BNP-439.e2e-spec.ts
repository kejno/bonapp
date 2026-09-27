import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GuestOrdersController } from '../src/guest-session/guest-orders.controller';
import { GuestSessionGuard } from '../src/guest-session/guest-session.guard';
import { GuestSessionService } from '../src/guest-session/guest-session.service';
import { MenuGateway } from '../src/menu/menu.gateway';
import { PrismaService } from '../src/prisma/prisma.service';

describe('BNP-439: отклонение некорректной гостевой корзины', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GuestOrdersController],
      providers: [
        GuestSessionService,
        { provide: PrismaService, useValue: {} },
        { provide: MenuGateway, useValue: { emitKitchenOrder: jest.fn() } },
      ],
    })
      .overrideGuard(GuestSessionGuard)
      .useValue({
        canActivate: (context: { switchToHttp(): { getRequest(): Record<string, unknown> } }) => {
          Object.assign(context.switchToHttp().getRequest(), { tenantId: 'tenant-439', tableId: 'table-439' });
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('отклоняет пустую корзину и возвращает 400', async () => {
    await request(app.getHttpServer() as never)
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', 'qr-439')
      .send({ qrToken: 'qr-439', comment: '', items: [] })
      .expect(400)
      .then((response) => expect((response.body as { message?: string }).message).toBe('Cart cannot be empty'));
  });

  it('отклоняет некорректное количество позиции', async () => {
    await request(app.getHttpServer() as never)
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', 'qr-439')
      .send({ qrToken: 'qr-439', comment: '', items: [{ menuItemId: 'dish-1', quantity: 0, selectedModifiers: [] }] })
      .expect(400)
      .then((response) => expect((response.body as { message?: string }).message).toBe('Invalid order item'));
  });
});
