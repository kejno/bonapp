import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createHmac } from 'crypto';
import { PaymentStatus } from '@prisma/client';
import { ConfigModule } from '@nestjs/config';
import { GuestModule } from '../src/guest/guest.module';
import { WebhooksModule } from '../src/webhooks/webhooks.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { EventsModule } from '../src/events/events.module';
import { PaymentService } from '../src/payment/payment.service';
import { OplatiService } from '../src/payment/oplati/oplati.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsGateway } from '../src/events/events.gateway';
import { PAYMENT_WEBHOOKS_QUEUE } from '../src/queues/queues.module';
import { PaymentWebhookConsumer } from '../src/queues/payment-webhook.consumer';

const WEBHOOK_SECRET = 'integration-test-secret';

function sign(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET)
    .update(Buffer.from(body))
    .digest('hex');
}

describe('Oplati Payment Flow (integration)', () => {
  let app: INestApplication<App>;
  let processedJobs: { externalId: string }[];

  const mockOrder = {
    id: 'order-test-1',
    tenantId: 'tenant-1',
    total: 4000,
    tipAmount: 500,
    isPaid: false,
    createdAt: new Date(),
  };

  const mockPayment = {
    id: 'payment-test-1',
    orderId: 'order-test-1',
    externalId: 'oplati-ext-001',
    provider: 'oplati',
    status: PaymentStatus.PENDING,
    qrCodeData: 'data:image/png;base64,qr-mock',
    deepLink: 'oplati://pay?id=oplati-ext-001',
    eripCode: '9876543210',
    totalWithTipsByn: 4500,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(mockOrder),
      update: jest.fn().mockResolvedValue({ ...mockOrder, isPaid: true }),
    },
    payment: {
      create: jest.fn().mockResolvedValue(mockPayment),
      findUnique: jest.fn().mockResolvedValue(mockPayment),
      update: jest
        .fn()
        .mockResolvedValue({ ...mockPayment, status: PaymentStatus.COMPLETED }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: any) => Promise<any>) =>
        fn(mockPrisma),
      ),
  };

  const mockOplati = {
    createPayment: jest.fn().mockResolvedValue({
      externalId: 'oplati-ext-001',
      qrCodeData: 'data:image/png;base64,qr-mock',
      deepLink: 'oplati://pay?id=oplati-ext-001',
      eripCode: '9876543210',
    }),
  };

  const mockEvents = {
    emitPaymentUpdate: jest.fn(),
    onModuleInit: jest.fn(),
  };

  beforeEach(async () => {
    processedJobs = [];
    jest.clearAllMocks();
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);
    mockPrisma.payment.create.mockResolvedValue(mockPayment);

    const mockQueue = {
      add: jest
        .fn()
        .mockImplementation(
          async (_name: string, data: { externalId: string }) => {
            processedJobs.push(data);
          },
        ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              OPLATI_BASE_URL: 'http://oplati.mock',
              OPLATI_API_KEY: 'test-key',
              OPLATI_CALLBACK_URL: 'http://app.test/webhooks/oplati',
              OPLATI_WEBHOOK_SECRET: WEBHOOK_SECRET,
            }),
          ],
        }),
        PrismaModule,
        EventsModule,
        GuestModule,
        WebhooksModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(OplatiService)
      .useValue(mockOplati)
      .overrideProvider(EventsGateway)
      .useValue(mockEvents)
      .overrideProvider(PAYMENT_WEBHOOKS_QUEUE)
      .useValue(mockQueue)
      .overrideProvider(PaymentWebhookConsumer)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /pay/oplati creates a PENDING payment and returns QR data', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/guest/orders/order-test-1/pay/oplati')
      .expect(201);

    expect(response.body).toMatchObject({
      paymentId: 'payment-test-1',
      qrCodeData: 'data:image/png;base64,qr-mock',
      deepLink: 'oplati://pay?id=oplati-ext-001',
      eripCode: '9876543210',
      totalWithTipsByn: 4500,
    });

    expect(mockOplati.createPayment).toHaveBeenCalledWith('order-test-1', 4500);
    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentStatus.PENDING,
          externalId: 'oplati-ext-001',
        }),
      }),
    );
  });

  it('POST /webhooks/oplati with valid signature enqueues a confirm-payment job', async () => {
    const body = JSON.stringify({
      paymentId: 'oplati-ext-001',
      status: 'paid',
    });
    const signature = sign(body);

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/oplati')
      .set('Content-Type', 'application/json')
      .set('x-oplati-signature', signature)
      .send(body)
      .expect(200);

    expect(processedJobs).toHaveLength(1);
    expect(processedJobs[0]).toEqual({ externalId: 'oplati-ext-001' });
  });

  it('POST /webhooks/oplati with invalid signature returns 401', async () => {
    const body = JSON.stringify({
      paymentId: 'oplati-ext-001',
      status: 'paid',
    });

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/oplati')
      .set('Content-Type', 'application/json')
      .set('x-oplati-signature', 'invalid-sig')
      .send(body)
      .expect(401);
  });

  it('full flow: payment PENDING after POST /pay/oplati, COMPLETED after processWebhookConfirmation', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/guest/orders/order-test-1/pay/oplati')
      .expect(201);

    const paymentService = app.get(PaymentService);
    await paymentService.processWebhookConfirmation('oplati-ext-001');

    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment-test-1', status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.COMPLETED },
      }),
    );
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-test-1' },
        data: { isPaid: true },
      }),
    );
    expect(mockEvents.emitPaymentUpdate).toHaveBeenCalledWith(
      'order-test-1',
      'payment-test-1',
    );
  });
});
