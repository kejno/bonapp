import { Test, TestingModule } from '@nestjs/testing';
import { PosService } from './pos.service';
import { PrismaService } from '../prisma/prisma.service';
import { PosQueueService } from './pos-queue.service';
import { RKeeperClientFactory } from './rkeeper/rkeeper.client-factory';
import { RKeeperMenuService } from './rkeeper/rkeeper.menu.service';
import { RKeeperOrderService } from './rkeeper/rkeeper.order.service';

describe('PosService', () => {
  let service: PosService;

  const mockQueue = {
    addSyncMenuJob: jest.fn().mockResolvedValue('job-1'),
    addSendOrderJob: jest.fn().mockResolvedValue('job-2'),
  };

  const mockPrisma = {
    posConnector: { findFirst: jest.fn() },
  };

  const mockRKeeperMenu = { importMenu: jest.fn() };
  const mockRKeeperOrder = { sendOrder: jest.fn() };
  const mockClient = { ping: jest.fn() };
  const mockClientFactory = { create: jest.fn().mockReturnValue(mockClient) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PosQueueService, useValue: mockQueue },
        { provide: RKeeperClientFactory, useValue: mockClientFactory },
        { provide: RKeeperMenuService, useValue: mockRKeeperMenu },
        { provide: RKeeperOrderService, useValue: mockRKeeperOrder },
      ],
    }).compile();

    service = module.get<PosService>(PosService);
  });

  describe('syncMenu', () => {
    it('enqueues a sync-menu job and returns its ID', async () => {
      const jobId = await service.syncMenu('tenant-1');

      expect(mockQueue.addSyncMenuJob).toHaveBeenCalledWith('tenant-1');
      expect(jobId).toBe('job-1');
    });
  });

  describe('sendOrder', () => {
    it('enqueues a send-order job and returns its ID', async () => {
      const jobId = await service.sendOrder('tenant-1', 'order-1');

      expect(mockQueue.addSendOrderJob).toHaveBeenCalledWith('tenant-1', 'order-1');
      expect(jobId).toBe('job-2');
    });
  });

  describe('getHealth', () => {
    it('returns unconfigured when no active connector exists', async () => {
      mockPrisma.posConnector.findFirst.mockResolvedValue(null);

      const result = await service.getHealth('tenant-1');

      expect(result).toEqual({ status: 'unconfigured' });
    });

    it('returns unsupported for IIKO connector (not yet implemented)', async () => {
      mockPrisma.posConnector.findFirst.mockResolvedValue({
        posType: 'IIKO',
        isActive: true,
      });

      const result = await service.getHealth('tenant-1');

      expect(result).toEqual({ status: 'unsupported', posType: 'IIKO' });
    });

    it('returns ok with latency when r_keeper responds successfully', async () => {
      mockPrisma.posConnector.findFirst.mockResolvedValue({
        posType: 'RKEEPER',
        baseUrl: 'http://rk.test',
        username: 'u',
        passwordEncrypted: 'p',
        isActive: true,
      });
      mockClient.ping.mockResolvedValue(42);

      const result = await service.getHealth('tenant-1');

      expect(result).toEqual({ status: 'ok', posType: 'RKEEPER', latencyMs: 42 });
    });

    it('returns error when r_keeper ping fails', async () => {
      mockPrisma.posConnector.findFirst.mockResolvedValue({
        posType: 'RKEEPER',
        baseUrl: 'http://rk.test',
        username: 'u',
        passwordEncrypted: 'p',
        isActive: true,
      });
      mockClient.ping.mockRejectedValue(new Error('timeout'));

      const result = await service.getHealth('tenant-1');

      expect(result).toEqual({ status: 'error', posType: 'RKEEPER' });
    });
  });

  describe('dispatchSyncMenu', () => {
    it('calls r_keeper importMenu when connector type is RKEEPER', async () => {
      mockPrisma.posConnector.findFirst.mockResolvedValue({
        posType: 'RKEEPER',
        isActive: true,
      });
      mockRKeeperMenu.importMenu.mockResolvedValue(undefined);

      await service.dispatchSyncMenu('tenant-1');

      expect(mockRKeeperMenu.importMenu).toHaveBeenCalledWith('tenant-1');
    });

    it('does nothing when no active connector is found', async () => {
      mockPrisma.posConnector.findFirst.mockResolvedValue(null);

      await service.dispatchSyncMenu('tenant-1');

      expect(mockRKeeperMenu.importMenu).not.toHaveBeenCalled();
    });

    it('does not call r_keeper for unsupported POS types', async () => {
      mockPrisma.posConnector.findFirst.mockResolvedValue({
        posType: 'IIKO',
        isActive: true,
      });

      await service.dispatchSyncMenu('tenant-1');

      expect(mockRKeeperMenu.importMenu).not.toHaveBeenCalled();
    });
  });

  describe('dispatchSendOrder', () => {
    it('calls r_keeper sendOrder when connector type is RKEEPER', async () => {
      mockPrisma.posConnector.findFirst.mockResolvedValue({
        posType: 'RKEEPER',
        isActive: true,
      });
      mockRKeeperOrder.sendOrder.mockResolvedValue(undefined);

      await service.dispatchSendOrder('tenant-1', 'order-1');

      expect(mockRKeeperOrder.sendOrder).toHaveBeenCalledWith('tenant-1', 'order-1');
    });

    it('does nothing when no active connector is found', async () => {
      mockPrisma.posConnector.findFirst.mockResolvedValue(null);

      await service.dispatchSendOrder('tenant-1', 'order-1');

      expect(mockRKeeperOrder.sendOrder).not.toHaveBeenCalled();
    });
  });
});
