import { Test, TestingModule } from '@nestjs/testing';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

describe('PosController', () => {
  let controller: PosController;

  const mockPosService = {
    syncMenu: jest.fn(),
    getHealth: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PosController],
      providers: [{ provide: PosService, useValue: mockPosService }],
    }).compile();

    controller = module.get<PosController>(PosController);
  });

  describe('syncMenu', () => {
    it('returns jobId from the queue service', async () => {
      mockPosService.syncMenu.mockResolvedValue('job-123');

      const result = await controller.syncMenu('tenant-1');

      expect(result).toEqual({ jobId: 'job-123' });
      expect(mockPosService.syncMenu).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('health', () => {
    it('returns ok health status with latency', async () => {
      const healthResult = { status: 'ok', posType: 'RKEEPER', latencyMs: 15 };
      mockPosService.getHealth.mockResolvedValue(healthResult);

      const result = await controller.health('tenant-1');

      expect(result).toEqual(healthResult);
      expect(mockPosService.getHealth).toHaveBeenCalledWith('tenant-1');
    });

    it('returns unconfigured status when no connector is set up', async () => {
      mockPosService.getHealth.mockResolvedValue({ status: 'unconfigured' });

      const result = await controller.health('tenant-1');

      expect(result).toEqual({ status: 'unconfigured' });
    });

    it('returns error status when POS API is unreachable', async () => {
      mockPosService.getHealth.mockResolvedValue({ status: 'error', posType: 'RKEEPER' });

      const result = await controller.health('tenant-1');

      expect(result).toEqual({ status: 'error', posType: 'RKEEPER' });
    });
  });
});
