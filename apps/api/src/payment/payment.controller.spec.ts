import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

describe('PaymentController', () => {
  let controller: PaymentController;
  let service: jest.Mocked<PaymentService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: PaymentService,
          useValue: {
            initiateErip: jest.fn(),
            initiateBepaid: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    service = module.get(PaymentService);
  });

  describe('payErip', () => {
    it('returns eripOrderNumber on success', async () => {
      service.initiateErip.mockResolvedValue({ eripOrderNumber: 'ERIP-001' });

      const result = await controller.payErip('order-1');

      expect(service.initiateErip).toHaveBeenCalledWith('order-1');
      expect(result).toEqual({ eripOrderNumber: 'ERIP-001' });
    });

    it('propagates NotFoundException from service', async () => {
      service.initiateErip.mockRejectedValue(new NotFoundException());

      await expect(controller.payErip('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propagates ConflictException from service', async () => {
      service.initiateErip.mockRejectedValue(new ConflictException());

      await expect(controller.payErip('order-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('payBepaid', () => {
    it('returns checkoutUrl on success', async () => {
      service.initiateBepaid.mockResolvedValue({
        checkoutUrl: 'https://checkout.bepaid.by/tok',
      });

      const result = await controller.payBepaid('order-1');

      expect(service.initiateBepaid).toHaveBeenCalledWith('order-1');
      expect(result).toEqual({ checkoutUrl: 'https://checkout.bepaid.by/tok' });
    });

    it('propagates NotFoundException from service', async () => {
      service.initiateBepaid.mockRejectedValue(new NotFoundException());

      await expect(controller.payBepaid('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
