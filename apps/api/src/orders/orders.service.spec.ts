import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { OrdersService } from './orders.service';

const mockPrismaService = {
  db: {
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
};

const mockTenantContextService = {
  getTenantId: jest.fn(),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantContextService, useValue: mockTenantContextService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('findAll()', () => {
    it('filters orders by the current tenant', async () => {
      const tenantId = 'tenant-a';
      const orders = [{ id: 'order-1', tenantId }];
      mockTenantContextService.getTenantId.mockReturnValue(tenantId);
      mockPrismaService.db.order.findMany.mockResolvedValue(orders);

      const result = await service.findAll();

      expect(result).toEqual(orders);
      expect(mockPrismaService.db.order.findMany).toHaveBeenCalledWith({
        where: { tenantId },
      });
    });

    it('does not return orders from other tenants', async () => {
      const tenantId = 'tenant-a';
      mockTenantContextService.getTenantId.mockReturnValue(tenantId);
      mockPrismaService.db.order.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(mockPrismaService.db.order.findMany).toHaveBeenCalledWith({
        where: { tenantId },
      });
    });
  });

  describe('findOne()', () => {
    it('returns the order when it belongs to the current tenant', async () => {
      const tenantId = 'tenant-a';
      const order = { id: 'order-1', tenantId };
      mockTenantContextService.getTenantId.mockReturnValue(tenantId);
      mockPrismaService.db.order.findFirst.mockResolvedValue(order);

      const result = await service.findOne('order-1');

      expect(result).toEqual(order);
      expect(mockPrismaService.db.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'order-1' },
      });
    });

    it('throws ForbiddenException when order belongs to another tenant', async () => {
      mockTenantContextService.getTenantId.mockReturnValue('tenant-a');
      mockPrismaService.db.order.findFirst.mockResolvedValue({
        id: 'order-b',
        tenantId: 'tenant-b',
      });

      await expect(service.findOne('order-b')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when order is not found', async () => {
      mockTenantContextService.getTenantId.mockReturnValue('tenant-a');
      mockPrismaService.db.order.findFirst.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
