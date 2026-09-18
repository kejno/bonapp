import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { OplatiWebhookController } from './oplati-webhook.controller';
import { PAYMENT_WEBHOOKS_QUEUE } from '../queues/queues.module';

const WEBHOOK_SECRET = 'test-secret';

function makeSignature(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(body)).digest('hex');
}

describe('OplatiWebhookController', () => {
  let controller: OplatiWebhookController;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OplatiWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => WEBHOOK_SECRET,
          },
        },
        {
          provide: PAYMENT_WEBHOOKS_QUEUE,
          useValue: mockQueue,
        },
      ],
    }).compile();

    controller = module.get<OplatiWebhookController>(OplatiWebhookController);
  });

  it('enqueues job when HMAC signature is valid', async () => {
    const body = JSON.stringify({ paymentId: 'ext-abc', status: 'paid' });
    const signature = makeSignature(body);

    await controller.processWebhook(Buffer.from(body), signature);

    expect(mockQueue.add).toHaveBeenCalledWith(
      'confirm-payment',
      { externalId: 'ext-abc' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('throws UnauthorizedException when signature is invalid', async () => {
    const body = JSON.stringify({ paymentId: 'ext-abc', status: 'paid' });

    await expect(
      controller.processWebhook(Buffer.from(body), 'bad-signature'),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when signature header is missing', async () => {
    const body = JSON.stringify({ paymentId: 'ext-abc', status: 'paid' });

    await expect(
      controller.processWebhook(Buffer.from(body), ''),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('extracts externalId from multiple webhook events and enqueues each', async () => {
    const events = [
      { paymentId: 'ext-1', status: 'paid' },
      { paymentId: 'ext-2', status: 'paid' },
    ];

    for (const event of events) {
      const body = JSON.stringify(event);
      const signature = makeSignature(body);
      await controller.processWebhook(Buffer.from(body), signature);
    }

    expect(mockQueue.add).toHaveBeenCalledTimes(2);
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      1,
      'confirm-payment',
      { externalId: 'ext-1' },
      expect.any(Object),
    );
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      2,
      'confirm-payment',
      { externalId: 'ext-2' },
      expect.any(Object),
    );
  });
});
