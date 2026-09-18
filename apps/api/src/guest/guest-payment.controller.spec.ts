import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { GuestPaymentController } from './guest-payment.controller';
import { PaymentService } from '../payment/payment.service';

describe('GuestPaymentController', () => {
  let controller: GuestPaymentController;
  let paymentService: jest.Mocked<PaymentService>;

  const mockPaymentResult = {
    paymentId: 'payment-1',
    qrCodeData: 'data:image/png;base64,abc',
    deepLink: 'oplati://pay?id=abc',
    eripCode: '1234567890',
    totalWithTipsByn: 4500,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuestPaymentController],
      providers: [
        {
          provide: PaymentService,
          useValue: { createOplatiPayment: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<GuestPaymentController>(GuestPaymentController);
    paymentService = module.get(PaymentService);
  });

  it('returns payment data when payment is created successfully', async () => {
    (paymentService.createOplatiPayment as jest.Mock).mockResolvedValue(
      mockPaymentResult,
    );

    const result = await controller.initiateOplatiPayment('order-1');

    expect(paymentService.createOplatiPayment).toHaveBeenCalledWith('order-1');
    expect(result).toEqual(mockPaymentResult);
  });

  it('propagates NotFoundException from PaymentService', async () => {
    (paymentService.createOplatiPayment as jest.Mock).mockRejectedValue(
      new NotFoundException('Order not found'),
    );

    await expect(controller.initiateOplatiPayment('non-existent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('propagates ConflictException from PaymentService', async () => {
    (paymentService.createOplatiPayment as jest.Mock).mockRejectedValue(
      new ConflictException('Order already paid'),
    );

    await expect(controller.initiateOplatiPayment('order-paid')).rejects.toThrow(
      ConflictException,
    );
  });
});
