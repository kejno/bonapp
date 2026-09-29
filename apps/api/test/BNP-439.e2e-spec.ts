import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GuestOrdersController } from '../src/guest-session/guest-orders.controller';
import { GuestSessionGuard } from '../src/guest-session/guest-session.guard';
import { GuestSessionService } from '../src/guest-session/guest-session.service';
import { MenuGateway } from '../src/menu/menu.gateway';
import { PrismaService } from '../src/prisma/prisma.service';
import { PosOrderDispatcher } from '../src/onboarding/pos-order-dispatcher';

describe('BNP-439: отклонение некорректной гостевой корзины', () => {
  let app: INestApplication;
  const menuItemFindFirst = jest.fn();
  const orderCreate = jest.fn();
  const emitKitchenOrder = jest.fn();
  const tx = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC', dailyOrderNumber: 0, dailyOrderNumberDate: null, serviceMode: 'TABLE_SERVICE' }),
      update: jest.fn(),
    },
    $executeRaw: jest.fn(),
    menuItem: { findFirst: menuItemFindFirst },
    order: { create: orderCreate },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GuestOrdersController],
      providers: [
        GuestSessionService,
        {
          provide: PrismaService,
          useValue: { transactionForTenant: (_tenantId: string, callback: (transaction: typeof tx) => unknown) => callback(tx) },
        },
        { provide: MenuGateway, useValue: { emitKitchenOrder } },
        { provide: PosOrderDispatcher, useValue: { enqueue: jest.fn() } },
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

  beforeEach(() => {
    menuItemFindFirst.mockReset();
    orderCreate.mockClear();
    emitKitchenOrder.mockClear();
  });

  async function expectRejectedWithoutSideEffects(body: Record<string, unknown>, message: string) {
    const response = await request(app.getHttpServer() as never)
      .post('/api/v1/guest/orders')
      .set('X-QR-Token', 'qr-439')
      .send({ qrToken: 'qr-439', comment: '', ...body })
      .expect(400);

    expect((response.body as { message: string }).message).toBe(message);
    expect(orderCreate).not.toHaveBeenCalled();
    expect(emitKitchenOrder).not.toHaveBeenCalled();
  }

  it('отклоняет пустую корзину без создания заказа и события', async () => {
    await expectRejectedWithoutSideEffects({ items: [] }, 'Cart cannot be empty');
    expect(menuItemFindFirst).not.toHaveBeenCalled();
  });

  it('отклоняет блюдо без обязательного модификатора без создания заказа и события', async () => {
    menuItemFindFirst.mockResolvedValue({
      id: 'dish-required-modifier',
      name: 'Блюдо с обязательным модификатором',
      priceByn: 12,
      kitchenDepartment: 'HOT',
      menuItemModifierGroups: [],
      modifierGroups: [{
        id: 'required-group',
        isActive: true,
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
        modifierOptions: [{ id: 'modifier-option', extraPriceByn: 0, isActive: true }],
      }],
      stopListItem: { isStopped: false },
    });

    await expectRejectedWithoutSideEffects({
      items: [{ menuItemId: 'dish-required-modifier', quantity: 1, selectedModifiers: [] }],
    }, 'Required modifiers are missing for Блюдо с обязательным модификатором');
  });

  it('отклоняет блюдо из стоп-листа без создания заказа и события', async () => {
    menuItemFindFirst.mockResolvedValue({
      id: 'dish-in-stop-list',
      name: 'Блюдо в стоп-листе',
      priceByn: 12,
      kitchenDepartment: 'HOT',
      menuItemModifierGroups: [],
      modifierGroups: [],
      stopListItem: { isStopped: true },
    });

    await expectRejectedWithoutSideEffects({
      items: [{ menuItemId: 'dish-in-stop-list', quantity: 1, selectedModifiers: [] }],
    }, 'One or more menu items are unavailable');
    const calls = menuItemFindFirst.mock.calls as unknown as [Record<string, unknown>][];
    const query = calls[0]?.[0];
    expect(query).toMatchObject({
      where: { id: 'dish-in-stop-list', isActive: true },
      include: { stopListItem: { select: { isStopped: true } } },
    });
  });
});
