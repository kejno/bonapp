import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

const mockPrismaService = {
  db: {
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('findAll()', () => {
    it('delegates to prisma.db.order.findMany and returns results', async () => {
      const orders = [{ id: 'order-1' }, { id: 'order-2' }];
      mockPrismaService.db.order.findMany.mockResolvedValue(orders);

      const result = await service.findAll();

      expect(result).toEqual(orders);
      expect(mockPrismaService.db.order.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne()', () => {
    it('returns the order when found', async () => {
      const order = { id: 'order-1', tenantId: 'tenant-1' };
      mockPrismaService.db.order.findFirst.mockResolvedValue(order);

      const result = await service.findOne('order-1');

      expect(result).toEqual(order);
      expect(mockPrismaService.db.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'order-1' },
      });
    });

    it('throws ForbiddenException when order is not found', async () => {
      mockPrismaService.db.order.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
