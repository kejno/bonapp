import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PaymentService } from './payment.service';
import { OplatiService } from './oplati/oplati.service';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';

const mockOrder = {
  id: 'order-1',
  tenantId: 'tenant-1',
  total: 4000,
  tipAmount: 500,
  isPaid: false,
  createdAt: new Date(),
  payments: [],
};

const mockPayment = {
  id: 'payment-1',
  orderId: 'order-1',
  externalId: 'ext-abc123',
  provider: 'oplati',
  status: PaymentStatus.PENDING,
  qrCodeData: 'qr-data',
  deepLink: 'oplati://pay',
  eripCode: '1234',
  totalWithTipsByn: 4500,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: jest.Mocked<PrismaService>;
  let oplatiService: jest.Mocked<OplatiService>;
  let eventsGateway: jest.Mocked<EventsGateway>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: {
            order: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            payment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: OplatiService,
          useValue: {
            createPayment: jest.fn(),
          },
        },
        {
          provide: EventsGateway,
          useValue: {
            emitPaymentUpdate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    prisma = module.get(PrismaService);
    oplatiService = module.get(OplatiService);
    eventsGateway = module.get(EventsGateway);
  });

  describe('createOplatiPayment', () => {
    it('creates a PENDING payment and returns payment data', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (oplatiService.createPayment as jest.Mock).mockResolvedValue({
        externalId: 'ext-abc123',
        qrCodeData: 'qr-data',
        deepLink: 'oplati://pay',
        eripCode: '1234',
      });
      (prisma.payment.create as jest.Mock).mockResolvedValue(mockPayment);

      const result = await service.createOplatiPayment('order-1');

      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: 'order-1' },
      });
      expect(oplatiService.createPayment).toHaveBeenCalledWith('order-1', 4500);
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'order-1',
            externalId: 'ext-abc123',
            provider: 'oplati',
            status: PaymentStatus.PENDING,
            totalWithTipsByn: 4500,
          }),
        }),
      );
      expect(result).toEqual({
        paymentId: 'payment-1',
        qrCodeData: 'qr-data',
        deepLink: 'oplati://pay',
        eripCode: '1234',
        totalWithTipsByn: 4500,
      });
    });

    it('throws NotFoundException when order does not exist', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.createOplatiPayment('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when order is already paid', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        isPaid: true,
      });

      await expect(service.createOplatiPayment('order-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('calculates totalWithTipsByn as total + tipAmount', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue({
        ...mockOrder,
        total: 3000,
        tipAmount: 200,
      });
      (oplatiService.createPayment as jest.Mock).mockResolvedValue({
        externalId: 'ext-xyz',
        qrCodeData: 'qr',
        deepLink: 'oplati://pay',
        eripCode: null,
      });
      (prisma.payment.create as jest.Mock).mockResolvedValue({
        ...mockPayment,
        totalWithTipsByn: 3200,
      });

      await service.createOplatiPayment('order-1');

      expect(oplatiService.createPayment).toHaveBeenCalledWith('order-1', 3200);
    });
  });

  describe('processWebhookConfirmation', () => {
    it('updates payment to COMPLETED and order isPaid=true, then emits WS event', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(mockPayment);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
        fn(prisma),
      );
      (prisma.payment.update as jest.Mock).mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      });

      await service.processWebhookConfirmation('ext-abc123');

      expect(prisma.payment.findUnique).toHaveBeenCalledWith({
        where: { externalId: 'ext-abc123' },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(eventsGateway.emitPaymentUpdate).toHaveBeenCalledWith(
        'order-1',
        'payment-1',
      );
    });

    it('is idempotent: skips processing when payment is already COMPLETED', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      });

      await service.processWebhookConfirmation('ext-abc123');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(eventsGateway.emitPaymentUpdate).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when payment with externalId does not exist', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.processWebhookConfirmation('unknown-ext'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
