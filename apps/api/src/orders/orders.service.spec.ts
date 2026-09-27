import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { MenuGateway } from '../menu/menu.gateway';
import { OrdersService } from './orders.service';

const mockPrismaService = {
  transactionForTenant: jest.fn(),
  db: {
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
};

const transaction = {
  table: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  tenant: { findUnique: jest.fn() },
  order: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  payment: { findFirst: jest.fn() },
  $executeRaw: jest.fn(),
};

const mockTenantContextService = {
  getTenantId: jest.fn(),
};
const mockGateway = { emitOrderStatusChanged: jest.fn() };

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.transactionForTenant.mockImplementation(
      (_tenantId: string, operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantContextService, useValue: mockTenantContextService },
        { provide: MenuGateway, useValue: mockGateway },
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
        include: { items: true, payments: true },
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

  describe('create()', () => {
    it('rejects when another request has already reserved the table', async () => {
      mockTenantContextService.getTenantId.mockReturnValue('tenant-a');
      transaction.table.findFirst.mockResolvedValue({ id: 'table-1', status: 'AVAILABLE' });
      transaction.table.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.create('table-1')).rejects.toBeInstanceOf(ConflictException);
      expect(transaction.order.create).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus()', () => {
    it('allows NEW to COOKING and emits the change', async () => {
      const order = { id: 'order-1', tenantId: 'tenant-a', tableId: 'table-1', status: OrderStatus.NEW };
      mockTenantContextService.getTenantId.mockReturnValue('tenant-a');
      transaction.order.findFirst.mockResolvedValue(order);
      transaction.order.update.mockResolvedValue({ ...order, status: OrderStatus.COOKING });

      await expect(service.changeStatus('order-1', OrderStatus.COOKING)).resolves.toMatchObject({ status: OrderStatus.COOKING });
      expect(transaction.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: OrderStatus.COOKING } }));
      expect(mockGateway.emitOrderStatusChanged).toHaveBeenCalledWith('tenant-a', 'order-1', OrderStatus.COOKING);
    });

    it('rejects backwards transitions', async () => {
      mockTenantContextService.getTenantId.mockReturnValue('tenant-a');
      transaction.order.findFirst.mockResolvedValue({ id: 'order-1', tenantId: 'tenant-a', status: OrderStatus.COOKING });
      await expect(service.changeStatus('order-1', OrderStatus.NEW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects direct PAID transition without payment processing', async () => {
      mockTenantContextService.getTenantId.mockReturnValue('tenant-a');
      transaction.order.findFirst.mockResolvedValue({ id: 'order-1', tenantId: 'tenant-a', status: OrderStatus.SERVED });
      await expect(service.changeStatus('order-1', OrderStatus.PAID)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
