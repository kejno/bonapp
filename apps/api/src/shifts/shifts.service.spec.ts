import { Test, TestingModule } from '@nestjs/testing';
import { ShiftsService } from './shifts.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const cashier = { id: 'cashier-1', name: 'Анна Кассир' };

const openShift = {
  id: 'shift-1',
  tenantId: 'tenant-1',
  openedAt: new Date('2026-09-17T08:00:00Z'),
  closedAt: null,
  cashierId: 'cashier-1',
  cashier,
  orders: [],
};

const mockPrisma = {
  shift: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  staffMember: {
    findFirst: jest.fn(),
  },
  order: {
    aggregate: jest.fn(),
  },
};

describe('ShiftsService', () => {
  let service: ShiftsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ShiftsService>(ShiftsService);
    jest.clearAllMocks();
  });

  describe('getCurrent', () => {
    it('returns the open shift for the tenant', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue({ ...openShift, orders: [{}] });
      const result = await service.getCurrent('tenant-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('shift-1');
      expect(result!.cashier.name).toBe('Анна Кассир');
      expect(result!.ordersCount).toBe(1);
    });

    it('returns null when no open shift', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      const result = await service.getCurrent('tenant-1');
      expect(result).toBeNull();
    });
  });

  describe('open', () => {
    it('creates a new shift with the given cashier', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      mockPrisma.staffMember.findFirst.mockResolvedValue(cashier);
      mockPrisma.shift.create.mockResolvedValue({ ...openShift, orders: [] });
      const result = await service.open('tenant-1', { cashierId: 'cashier-1' });
      expect(result.id).toBe('shift-1');
      expect(result.cashier.name).toBe('Анна Кассир');
      expect(result.ordersCount).toBe(0);
    });

    it('throws BadRequestException when a shift is already open', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue(openShift);
      await expect(service.open('tenant-1', { cashierId: 'cashier-1' })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when cashier not found', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      mockPrisma.staffMember.findFirst.mockResolvedValue(null);
      await expect(service.open('tenant-1', { cashierId: 'missing' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('close', () => {
    it('closes the shift and returns summary with revenue from paid orders', async () => {
      const closedAt = new Date('2026-09-17T20:00:00Z');
      mockPrisma.shift.findFirst.mockResolvedValue(openShift);
      mockPrisma.shift.update.mockResolvedValue({ ...openShift, closedAt, cashier });
      mockPrisma.order.aggregate.mockResolvedValue({
        _count: { _all: 3 },
        _sum: { totalAmount: 150.5 },
      });
      const result = await service.close('tenant-1', 'shift-1');
      expect(result.closedAt).toBe(closedAt.toISOString());
      expect(result.ordersCount).toBe(3);
      expect(result.totalRevenue).toBeCloseTo(150.5);
    });

    it('returns zero revenue when no paid orders', async () => {
      const closedAt = new Date();
      mockPrisma.shift.findFirst.mockResolvedValue(openShift);
      mockPrisma.shift.update.mockResolvedValue({ ...openShift, closedAt, cashier });
      mockPrisma.order.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { totalAmount: null },
      });
      const result = await service.close('tenant-1', 'shift-1');
      expect(result.ordersCount).toBe(0);
      expect(result.totalRevenue).toBe(0);
    });

    it('throws NotFoundException when shift not found', async () => {
      mockPrisma.shift.findFirst.mockResolvedValue(null);
      await expect(service.close('tenant-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
