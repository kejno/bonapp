import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { BepaidClient } from './bepaid.client';
import { EripClient } from './erip.client';
import { PaymentService } from './payment.service';
import { PrismaService } from '../prisma/prisma.service';

const mockOrder = {
  id: 'order-1',
  tenantId: 'tenant-1',
  tableId: 'table-1',
  tableSessionId: 'session-1',
  amount: 1000,
  currency: 'BYN',
  is_paid: false,
};

const mockPendingErip = {
  id: 'pay-1',
  orderId: 'order-1',
  tenantId: 'tenant-1',
  method: PaymentMethod.ERIP,
  status: PaymentStatus.PENDING,
  amount: 1000,
  currency: 'BYN',
  gatewayRef: 'ERIP-001',
};

const mockPendingBepaid = {
  id: 'pay-2',
  orderId: 'order-1',
  tenantId: 'tenant-1',
  method: PaymentMethod.BEPAID,
  status: PaymentStatus.PENDING,
  amount: 1000,
  currency: 'BYN',
  gatewayRef: 'bepaid-token-001',
};

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: jest.Mocked<PrismaService>;
  let eripClient: jest.Mocked<EripClient>;
  let bepaidClient: jest.Mocked<BepaidClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: {
            order: { findUnique: jest.fn() },
            payment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
          },
        },
        {
          provide: EripClient,
          useValue: {
            createOrder: jest.fn(),
            cancelOrder: jest.fn(),
          },
        },
        {
          provide: BepaidClient,
          useValue: {
            createCheckout: jest.fn(),
            voidCheckout: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    prisma = module.get(PrismaService);
    eripClient = module.get(EripClient);
    bepaidClient = module.get(BepaidClient);
  });

  describe('initiateErip', () => {
    it('creates a new ERIP payment when no pending payment exists', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(null);
      eripClient.createOrder.mockResolvedValue({ eripOrderNumber: 'ERIP-NEW' });
      (prisma.payment.create as jest.Mock).mockResolvedValue({
        ...mockPendingErip,
        gatewayRef: 'ERIP-NEW',
      });

      const result = await service.initiateErip('order-1');

      expect(eripClient.createOrder).toHaveBeenCalledWith(
        'order-1',
        mockOrder.amount,
        mockOrder.currency,
      );
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            method: PaymentMethod.ERIP,
            status: PaymentStatus.PENDING,
            gatewayRef: 'ERIP-NEW',
          }),
        }),
      );
      expect(result).toEqual({ eripOrderNumber: 'ERIP-NEW' });
    });

    it('returns existing ERIP order number for duplicate ERIP request (idempotent)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPendingErip);

      const result = await service.initiateErip('order-1');

      expect(eripClient.createOrder).not.toHaveBeenCalled();
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(result).toEqual({ eripOrderNumber: 'ERIP-001' });
    });

    it('cancels pending bePaid payment and creates ERIP when switching methods', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPendingBepaid);
      bepaidClient.voidCheckout.mockResolvedValue(true);
      (prisma.payment.update as jest.Mock).mockResolvedValue({
        ...mockPendingBepaid,
        status: PaymentStatus.FAILED,
      });
      eripClient.createOrder.mockResolvedValue({ eripOrderNumber: 'ERIP-NEW' });
      (prisma.payment.create as jest.Mock).mockResolvedValue({
        ...mockPendingErip,
        gatewayRef: 'ERIP-NEW',
      });

      const result = await service.initiateErip('order-1');

      expect(bepaidClient.voidCheckout).toHaveBeenCalledWith('bepaid-token-001');
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: PaymentStatus.FAILED },
          where: { id: 'pay-2' },
        }),
      );
      expect(result).toEqual({ eripOrderNumber: 'ERIP-NEW' });
    });

    it('throws 409 when bePaid cancel fails and ERIP payment cannot be created', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPendingBepaid);
      bepaidClient.voidCheckout.mockResolvedValue(false);

      await expect(service.initiateErip('order-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when order does not exist', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.initiateErip('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('initiateBepaid', () => {
    it('creates a new bePaid checkout when no pending payment exists', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(null);
      bepaidClient.createCheckout.mockResolvedValue({
        token: 'tok-new',
        checkoutUrl: 'https://checkout.bepaid.by/tok-new',
      });
      (prisma.payment.create as jest.Mock).mockResolvedValue({
        ...mockPendingBepaid,
        gatewayRef: 'tok-new',
      });

      const result = await service.initiateBepaid('order-1');

      expect(bepaidClient.createCheckout).toHaveBeenCalledWith(
        'order-1',
        mockOrder.amount,
        mockOrder.currency,
      );
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            method: PaymentMethod.BEPAID,
            status: PaymentStatus.PENDING,
            gatewayRef: 'tok-new',
          }),
        }),
      );
      expect(result).toEqual({ checkoutUrl: 'https://checkout.bepaid.by/tok-new' });
    });

    it('returns existing checkoutUrl for duplicate bePaid request (idempotent)', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        ...mockPendingBepaid,
        checkoutUrl: 'https://checkout.bepaid.by/bepaid-token-001',
      });

      const result = await service.initiateBepaid('order-1');

      expect(bepaidClient.createCheckout).not.toHaveBeenCalled();
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(result).toEqual({ checkoutUrl: 'https://checkout.bepaid.by/bepaid-token-001' });
    });

    it('cancels pending ERIP payment and creates bePaid when switching methods', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPendingErip);
      eripClient.cancelOrder.mockResolvedValue(true);
      (prisma.payment.update as jest.Mock).mockResolvedValue({
        ...mockPendingErip,
        status: PaymentStatus.FAILED,
      });
      bepaidClient.createCheckout.mockResolvedValue({
        token: 'tok-new',
        checkoutUrl: 'https://checkout.bepaid.by/tok-new',
      });
      (prisma.payment.create as jest.Mock).mockResolvedValue({
        ...mockPendingBepaid,
        gatewayRef: 'tok-new',
      });

      const result = await service.initiateBepaid('order-1');

      expect(eripClient.cancelOrder).toHaveBeenCalledWith('ERIP-001');
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: PaymentStatus.FAILED },
          where: { id: 'pay-1' },
        }),
      );
      expect(result).toEqual({ checkoutUrl: 'https://checkout.bepaid.by/tok-new' });
    });

    it('throws 409 when ERIP cancel fails and bePaid payment cannot be created', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPendingErip);
      eripClient.cancelOrder.mockResolvedValue(false);

      await expect(service.initiateBepaid('order-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when order does not exist', async () => {
      (prisma.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.initiateBepaid('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
