import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentWebhookConsumer } from './payment-webhook.consumer';
import { PaymentService } from '../payment/payment.service';

describe('PaymentWebhookConsumer', () => {
  let consumer: PaymentWebhookConsumer;
  let paymentService: jest.Mocked<PaymentService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentWebhookConsumer,
        {
          provide: PaymentService,
          useValue: { processWebhookConfirmation: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('localhost') },
        },
      ],
    }).compile();

    consumer = module.get<PaymentWebhookConsumer>(PaymentWebhookConsumer);
    paymentService = module.get(PaymentService);
  });

  it('calls processWebhookConfirmation with externalId from job data', async () => {
    (paymentService.processWebhookConfirmation as jest.Mock).mockResolvedValue(
      undefined,
    );

    await consumer.process({ data: { externalId: 'ext-abc123' } } as any);

    expect(paymentService.processWebhookConfirmation).toHaveBeenCalledWith(
      'ext-abc123',
    );
  });

  it('processes multiple jobs with different externalIds', async () => {
    (paymentService.processWebhookConfirmation as jest.Mock).mockResolvedValue(
      undefined,
    );

    await consumer.process({ data: { externalId: 'ext-1' } } as any);
    await consumer.process({ data: { externalId: 'ext-2' } } as any);

    expect(paymentService.processWebhookConfirmation).toHaveBeenNthCalledWith(
      1,
      'ext-1',
    );
    expect(paymentService.processWebhookConfirmation).toHaveBeenNthCalledWith(
      2,
      'ext-2',
    );
  });

  it('propagates errors from processWebhookConfirmation to allow BullMQ retry', async () => {
    (paymentService.processWebhookConfirmation as jest.Mock).mockRejectedValue(
      new NotFoundException('Payment not found'),
    );

    await expect(
      consumer.process({ data: { externalId: 'unknown' } } as any),
    ).rejects.toThrow(NotFoundException);
  });
});
