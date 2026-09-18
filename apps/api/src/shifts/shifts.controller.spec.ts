import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

const mockShiftsService = {
  openShift: jest.fn(),
  closeShift: jest.fn(),
};

describe('ShiftsController', () => {
  let controller: ShiftsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShiftsController],
      providers: [{ provide: ShiftsService, useValue: mockShiftsService }],
    }).compile();

    controller = module.get(ShiftsController);
  });

  describe('open', () => {
    it('should return shift object on success', async () => {
      const shift = { id: 'shift-1', tenantId: 'tenant-1', status: 'OPEN' };
      mockShiftsService.openShift.mockResolvedValue(shift);

      const result = await controller.open('tenant-1');

      expect(mockShiftsService.openShift).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ shift });
    });

    it('should propagate NotFoundException when tenant settings missing', async () => {
      mockShiftsService.openShift.mockRejectedValue(new NotFoundException());

      await expect(controller.open('tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('close', () => {
    it('should return shift and zReport on success', async () => {
      const shift = { id: 'shift-1', status: 'CLOSED' };
      const zReport = { reportNumber: 'Z-001', closedAt: '2026-09-18T10:00:00Z', totalAmount: 1000, receiptCount: 5 };
      mockShiftsService.closeShift.mockResolvedValue({ shift, zReport });

      const result = await controller.close('tenant-1');

      expect(mockShiftsService.closeShift).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ shift, zReport });
    });

    it('should propagate ConflictException when unresolved fiscalizations exist', async () => {
      mockShiftsService.closeShift.mockRejectedValue(
        new ConflictException('Cannot close shift: 2 unresolved fiscalization(s) remain'),
      );

      await expect(controller.close('tenant-1')).rejects.toThrow(ConflictException);
    });

    it('should propagate NotFoundException when no open shift', async () => {
      mockShiftsService.closeShift.mockRejectedValue(new NotFoundException());

      await expect(controller.close('tenant-1')).rejects.toThrow(NotFoundException);
    });
  });
});
