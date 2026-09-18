import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { REDIS_CONNECTION } from '../queue/queue.module';
import { PrismaService } from '../prisma/prisma.service';
import { SocketService } from '../socket/socket.service';
import { WebhookConsumer } from './webhook.consumer';
import { WebhookJobData } from './webhook.service';

const mockOrder = {
  id: 'order-1',
  tenantId: 'tenant-1',
  tableSessionId: 'session-1',
};

const mockPendingPayment = {
  id: 'pay-1',
  orderId: 'order-1',
  tenantId: 'tenant-1',
  method: PaymentMethod.ERIP,
  status: PaymentStatus.PENDING,
  gatewayRef: 'ERIP-001',
  order: mockOrder,
};

function makeJob(data: WebhookJobData): Job<WebhookJobData> {
  return { data } as Job<WebhookJobData>;
}

describe('WebhookConsumer', () => {
  let consumer: WebhookConsumer;
  let prisma: jest.Mocked<PrismaService>;
  let socketService: jest.Mocked<SocketService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookConsumer,
        {
          provide: PrismaService,
          useValue: {
            payment: { findFirst: jest.fn(), updateMany: jest.fn() },
            order: { update: jest.fn() },
          },
        },
        {
          provide: SocketService,
          useValue: { emitToRoom: jest.fn() },
        },
        {
          provide: REDIS_CONNECTION,
          useValue: {},
        },
      ],
    }).compile();

    consumer = module.get<WebhookConsumer>(WebhookConsumer);
    prisma = module.get(PrismaService);
    socketService = module.get(SocketService);
  });

  describe('processJob — ERIP confirmed', () => {
    it('marks payment COMPLETED, sets is_paid=true and emits WS event', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPendingPayment);
      (prisma.payment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.order.update as jest.Mock).mockResolvedValue({ ...mockOrder, is_paid: true });

      const job = makeJob({
        provider: 'ERIP',
        gatewayRef: 'ERIP-001',
        newStatus: 'COMPLETED',
        rawPayload: {},
      });

      await consumer.processJob(job);

      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: { gatewayRef: 'ERIP-001', method: PaymentMethod.ERIP },
        include: { order: true },
      });
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-1', status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.COMPLETED, webhookPayload: {} },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { is_paid: true },
      });
      expect(socketService.emitToRoom).toHaveBeenCalledWith(
        'tenant:tenant-1',
        'payment.status_changed',
        expect.objectContaining({ status: 'COMPLETED', method: 'ERIP' }),
      );
      expect(socketService.emitToRoom).toHaveBeenCalledWith(
        'table:session-1',
        'payment.status_changed',
        expect.objectContaining({ status: 'COMPLETED', method: 'ERIP' }),
      );
    });
  });

  describe('processJob — ERIP failed', () => {
    it('marks payment FAILED and does not set is_paid or emit COMPLETED event', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPendingPayment);
      (prisma.payment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const job = makeJob({
        provider: 'ERIP',
        gatewayRef: 'ERIP-001',
        newStatus: 'FAILED',
        rawPayload: {},
      });

      await consumer.processJob(job);

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-1', status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, webhookPayload: {} },
      });
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(socketService.emitToRoom).toHaveBeenCalledWith(
        'tenant:tenant-1',
        'payment.status_changed',
        expect.objectContaining({ status: 'FAILED' }),
      );
      expect(socketService.emitToRoom).toHaveBeenCalledWith(
        'table:session-1',
        'payment.status_changed',
        expect.objectContaining({ status: 'FAILED' }),
      );
    });
  });

  describe('processJob — bePaid completed', () => {
    it('marks bePaid payment COMPLETED, sets is_paid=true and emits WS', async () => {
      const bepaidPayment = {
        ...mockPendingPayment,
        id: 'pay-2',
        method: PaymentMethod.BEPAID,
        gatewayRef: 'tok-001',
      };
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(bepaidPayment);
      (prisma.payment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.order.update as jest.Mock).mockResolvedValue({ ...mockOrder, is_paid: true });

      const job = makeJob({
        provider: 'BEPAID',
        gatewayRef: 'tok-001',
        newStatus: 'COMPLETED',
        rawPayload: {},
      });

      await consumer.processJob(job);

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-2', status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.COMPLETED, webhookPayload: {} },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { is_paid: true },
      });
      expect(socketService.emitToRoom).toHaveBeenCalledWith(
        'tenant:tenant-1',
        'payment.status_changed',
        expect.objectContaining({ status: 'COMPLETED', method: 'BEPAID' }),
      );
    });
  });

  describe('processJob — idempotency', () => {
    it('skips processing when payment is already COMPLETED (duplicate webhook)', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        ...mockPendingPayment,
        status: PaymentStatus.COMPLETED,
      });

      const job = makeJob({
        provider: 'ERIP',
        gatewayRef: 'ERIP-001',
        newStatus: 'COMPLETED',
        rawPayload: {},
      });

      await consumer.processJob(job);

      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(socketService.emitToRoom).not.toHaveBeenCalled();
    });

    it('skips processing when payment is already FAILED', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue({
        ...mockPendingPayment,
        status: PaymentStatus.FAILED,
      });

      const job = makeJob({
        provider: 'ERIP',
        gatewayRef: 'ERIP-001',
        newStatus: 'FAILED',
        rawPayload: {},
      });

      await consumer.processJob(job);

      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(socketService.emitToRoom).not.toHaveBeenCalled();
    });
  });

  describe('processJob — payment not found', () => {
    it('skips processing gracefully when no payment matches gatewayRef', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(null);

      const job = makeJob({
        provider: 'ERIP',
        gatewayRef: 'ERIP-UNKNOWN',
        newStatus: 'COMPLETED',
        rawPayload: {},
      });

      await consumer.processJob(job);

      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(socketService.emitToRoom).not.toHaveBeenCalled();
    });
  });

  describe('processJob — concurrent delivery', () => {
    it('does not update the order or emit when another worker already changed the status', async () => {
      (prisma.payment.findFirst as jest.Mock).mockResolvedValue(mockPendingPayment);
      (prisma.payment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await consumer.processJob(
        makeJob({
          provider: 'ERIP',
          gatewayRef: 'ERIP-001',
          newStatus: 'COMPLETED',
          rawPayload: {},
        }),
      );

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(socketService.emitToRoom).not.toHaveBeenCalled();
    });
  });
});
