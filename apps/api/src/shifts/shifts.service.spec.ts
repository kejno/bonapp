import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { PrismaService } from '../prisma/prisma.service';
import { SKNO_API_SERVICE } from '../fiscal/skno/skno-api.interface';

const mockSknoApi = {
  openShift: jest.fn(),
  closeShift: jest.fn(),
};

const mockPrisma = {
  tenantSettings: { findUnique: jest.fn() },
  shift: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  payment: { count: jest.fn() },
};

const tenantSettings = {
  id: 'ts-1',
  tenantId: 'tenant-1',
  sknoSerial: 'SN-001',
  sknoUnp: '123456789',
  sknoApiUrl: 'http://skno.local',
};

describe('ShiftsService', () => {
  let service: ShiftsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SKNO_API_SERVICE, useValue: mockSknoApi },
      ],
    }).compile();

    service = module.get(ShiftsService);
  });

  describe('openShift', () => {
    it('should call SKNO openShift and create a Shift record', async () => {
      const createdShift = { id: 'shift-1', tenantId: 'tenant-1', status: 'OPEN' };
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(tenantSettings);
      mockSknoApi.openShift.mockResolvedValue(undefined);
      mockPrisma.shift.create.mockResolvedValue(createdShift);

      const result = await service.openShift('tenant-1');

      expect(mockSknoApi.openShift).toHaveBeenCalledWith('SN-001', '123456789');
      expect(mockPrisma.shift.create).toHaveBeenCalledWith({ data: { tenantId: 'tenant-1' } });
      expect(result).toEqual(createdShift);
    });

    it('should throw NotFoundException when tenant settings are missing', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);

      await expect(service.openShift('tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('closeShift', () => {
    const openShift = { id: 'shift-1', tenantId: 'tenant-1', status: 'OPEN' };
    const zReport = {
      reportNumber: 'Z-001',
      closedAt: '2026-09-18T10:00:00Z',
      totalAmount: 1000,
      receiptCount: 5,
    };

    it('should close shift and return Z-report when no unresolved fiscalizations', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(tenantSettings);
      mockPrisma.shift.findFirst.mockResolvedValue(openShift);
      mockPrisma.payment.count.mockResolvedValue(0);
      mockSknoApi.closeShift.mockResolvedValue(zReport);
      const closedShift = { ...openShift, status: 'CLOSED', closedAt: new Date(), zReport };
      mockPrisma.shift.update.mockResolvedValue(closedShift);

      const result = await service.closeShift('tenant-1');

      expect(mockSknoApi.closeShift).toHaveBeenCalledWith('SN-001', '123456789');
      expect(mockPrisma.shift.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'shift-1' } }),
      );
      expect(result.zReport).toEqual(zReport);
    });

    it('should throw ConflictException when unresolved fiscalizations exist', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(tenantSettings);
      mockPrisma.shift.findFirst.mockResolvedValue(openShift);
      mockPrisma.payment.count.mockResolvedValue(2);

      await expect(service.closeShift('tenant-1')).rejects.toThrow(ConflictException);
      expect(mockSknoApi.closeShift).not.toHaveBeenCalled();
    });

    it('should include unresolved count in ConflictException message', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(tenantSettings);
      mockPrisma.shift.findFirst.mockResolvedValue(openShift);
      mockPrisma.payment.count.mockResolvedValue(3);

      await expect(service.closeShift('tenant-1')).rejects.toThrow('3 unresolved fiscalization(s)');
    });

    it('should throw NotFoundException when no open shift exists', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(tenantSettings);
      mockPrisma.shift.findFirst.mockResolvedValue(null);

      await expect(service.closeShift('tenant-1')).rejects.toThrow(NotFoundException);
    });

    it('should query unresolved count with PENDING and FISCAL_FAILED statuses', async () => {
      mockPrisma.tenantSettings.findUnique.mockResolvedValue(tenantSettings);
      mockPrisma.shift.findFirst.mockResolvedValue(openShift);
      mockPrisma.payment.count.mockResolvedValue(0);
      mockSknoApi.closeShift.mockResolvedValue(zReport);
      mockPrisma.shift.update.mockResolvedValue({ ...openShift, status: 'CLOSED' });

      await service.closeShift('tenant-1');

      expect(mockPrisma.payment.count).toHaveBeenCalledWith({
        where: {
          shiftId: 'shift-1',
          fiscalStatus: { in: ['PENDING', 'FISCAL_FAILED'] },
        },
      });
    });
  });
});
