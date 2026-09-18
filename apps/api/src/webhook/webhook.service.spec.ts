import { createHmac } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { WEBHOOK_QUEUE } from '../queue/queue.module';
import { PaymentConfigService } from '../config/payment-config.service';
import { WebhookService } from './webhook.service';

const ERIP_SECRET = 'erip-secret-test';
const BEPAID_SECRET = 'bepaid-secret-test';

function signHmacSha256(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('WebhookService', () => {
  let service: WebhookService;
  let queue: jest.Mocked<Queue>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: PaymentConfigService,
          useValue: {
            eripWebhookSecret: ERIP_SECRET,
            bepaidWebhookSecret: BEPAID_SECRET,
          },
        },
        {
          provide: WEBHOOK_QUEUE,
          useValue: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    queue = module.get(WEBHOOK_QUEUE);
  });

  describe('verifyEripSignature', () => {
    it('returns true for a valid HMAC-SHA256 signature', () => {
      const body = JSON.stringify({ erip_order_number: 'E001', status: 'CONFIRMED' });
      const signature = signHmacSha256(ERIP_SECRET, body);

      expect(service.verifyEripSignature(signature, body)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const body = JSON.stringify({ erip_order_number: 'E001', status: 'CONFIRMED' });
      expect(service.verifyEripSignature('sha256=bad', body)).toBe(false);
    });

    it('returns false when signature header is missing', () => {
      const body = JSON.stringify({ erip_order_number: 'E001' });
      expect(service.verifyEripSignature('', body)).toBe(false);
    });
  });

  describe('verifyBepaidSignature', () => {
    it('returns true for a valid HMAC-SHA256 signature', () => {
      const body = JSON.stringify({
        transaction: { uid: 'tok-1', status: 'successful' },
      });
      const signature = signHmacSha256(BEPAID_SECRET, body);

      expect(service.verifyBepaidSignature(signature, body)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const body = JSON.stringify({ transaction: { uid: 'tok-1', status: 'successful' } });
      expect(service.verifyBepaidSignature('sha256=wrong', body)).toBe(false);
    });
  });

  describe('enqueueEripWebhook', () => {
    it('adds a job to the queue with ERIP provider data', async () => {
      const payload = { erip_order_number: 'E001', status: 'CONFIRMED' };

      await service.enqueueEripWebhook(payload);

      expect(queue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.objectContaining({
          provider: 'ERIP',
          gatewayRef: 'E001',
          newStatus: 'COMPLETED',
        }),
        expect.any(Object),
      );
    });

    it('maps ERIP FAILED status to FAILED job', async () => {
      const payload = { erip_order_number: 'E002', status: 'FAILED' };

      await service.enqueueEripWebhook(payload);

      expect(queue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.objectContaining({ newStatus: 'FAILED' }),
        expect.any(Object),
      );
    });
  });

  describe('enqueueBepaidWebhook', () => {
    it('adds a job to the queue with bePaid provider data', async () => {
      const payload = { transaction: { uid: 'tok-1', status: 'successful' } };

      await service.enqueueBepaidWebhook(payload);

      expect(queue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.objectContaining({
          provider: 'BEPAID',
          gatewayRef: 'tok-1',
          newStatus: 'COMPLETED',
        }),
        expect.any(Object),
      );
    });

    it('maps non-successful bePaid status to FAILED', async () => {
      const payload = { transaction: { uid: 'tok-2', status: 'failed' } };

      await service.enqueueBepaidWebhook(payload);

      expect(queue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.objectContaining({ newStatus: 'FAILED' }),
        expect.any(Object),
      );
    });
  });
});
