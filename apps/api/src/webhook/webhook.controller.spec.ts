import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

const ERIP_PAYLOAD = { erip_order_number: 'E001', status: 'CONFIRMED' };
const BEPAID_PAYLOAD = { transaction: { uid: 'tok-1', status: 'successful' } };
const ERIP_RAW = Buffer.from(JSON.stringify(ERIP_PAYLOAD));
const BEPAID_RAW = Buffer.from(JSON.stringify(BEPAID_PAYLOAD));

describe('WebhookController', () => {
  let controller: WebhookController;
  let service: jest.Mocked<WebhookService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: WebhookService,
          useValue: {
            verifyEripSignature: jest.fn(),
            verifyBepaidSignature: jest.fn(),
            enqueueEripWebhook: jest.fn().mockResolvedValue(undefined),
            enqueueBepaidWebhook: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
    service = module.get(WebhookService);
  });

  describe('handleEripWebhook', () => {
    it('enqueues webhook and returns received:true for valid signature', async () => {
      service.verifyEripSignature.mockReturnValue(true);

      const result = await controller.handleEripWebhook(
        'sha256=valid',
        ERIP_RAW,
        ERIP_PAYLOAD,
      );

      expect(service.verifyEripSignature).toHaveBeenCalledWith(
        'sha256=valid',
        ERIP_RAW.toString('utf8'),
      );
      expect(service.enqueueEripWebhook).toHaveBeenCalledWith(ERIP_PAYLOAD);
      expect(result).toEqual({ received: true });
    });

    it('throws UnauthorizedException for invalid signature', async () => {
      service.verifyEripSignature.mockReturnValue(false);

      await expect(
        controller.handleEripWebhook('sha256=bad', ERIP_RAW, ERIP_PAYLOAD),
      ).rejects.toThrow(UnauthorizedException);

      expect(service.enqueueEripWebhook).not.toHaveBeenCalled();
    });
  });

  describe('handleBepaidWebhook', () => {
    it('enqueues webhook and returns received:true for valid signature', async () => {
      service.verifyBepaidSignature.mockReturnValue(true);

      const result = await controller.handleBepaidWebhook(
        'sha256=valid',
        BEPAID_RAW,
        BEPAID_PAYLOAD,
      );

      expect(service.verifyBepaidSignature).toHaveBeenCalledWith(
        'sha256=valid',
        BEPAID_RAW.toString('utf8'),
      );
      expect(service.enqueueBepaidWebhook).toHaveBeenCalledWith(BEPAID_PAYLOAD);
      expect(result).toEqual({ received: true });
    });

    it('throws UnauthorizedException for invalid signature', async () => {
      service.verifyBepaidSignature.mockReturnValue(false);

      await expect(
        controller.handleBepaidWebhook('sha256=bad', BEPAID_RAW, BEPAID_PAYLOAD),
      ).rejects.toThrow(UnauthorizedException);

      expect(service.enqueueBepaidWebhook).not.toHaveBeenCalled();
    });
  });
});
