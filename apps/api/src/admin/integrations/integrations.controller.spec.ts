import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IntegrationStatus } from '@bonapp/shared-types';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

const mockService = () => ({
  getStatus: jest.fn(),
  syncMenu: jest.fn(),
});

describe('IntegrationsController', () => {
  let controller: IntegrationsController;
  let service: ReturnType<typeof mockService>;

  beforeEach(async () => {
    service = mockService();
    const module = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [{ provide: IntegrationsService, useValue: service }],
    }).compile();
    controller = module.get(IntegrationsController);
  });

  describe('getStatus', () => {
    it('delegates to service and returns result', async () => {
      const expected = {
        iiko: { status: IntegrationStatus.Online, pingMs: 42 },
        rKeeper: { status: IntegrationStatus.NotConfigured, pingMs: null },
        oplaty: { status: IntegrationStatus.Active, merchantId: 'M-1' },
        erip: { status: IntegrationStatus.NotConfigured, serviceId: null },
        bePaid: { status: IntegrationStatus.Active, shopId: 'S-1', mode: 'test' },
        skno: { status: IntegrationStatus.Offline, serialNumber: 'SN-1', pingMs: null },
      };
      service.getStatus.mockResolvedValue(expected);

      const result = await controller.getStatus('tenant-1');

      expect(result).toEqual(expected);
      expect(service.getStatus).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('sync', () => {
    it('returns 202 body for iiko', async () => {
      service.syncMenu.mockResolvedValue(undefined);

      const result = await controller.sync('iiko', 'tenant-1');

      expect(result).toEqual({ message: 'Sync started' });
      expect(service.syncMenu).toHaveBeenCalledWith('tenant-1', 'iiko');
    });

    it('returns 202 body for r_keeper', async () => {
      service.syncMenu.mockResolvedValue(undefined);

      const result = await controller.sync('r_keeper', 'tenant-1');

      expect(result).toEqual({ message: 'Sync started' });
      expect(service.syncMenu).toHaveBeenCalledWith('tenant-1', 'r_keeper');
    });

    it('throws BadRequestException for unknown provider', async () => {
      await expect(controller.sync('sap', 'tenant-1')).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when service throws NotConfigured', async () => {
      service.syncMenu.mockRejectedValue(new Error('NotConfigured'));

      await expect(controller.sync('iiko', 'tenant-1')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when service throws ConnectionFailed', async () => {
      service.syncMenu.mockRejectedValue(new Error('ConnectionFailed'));

      await expect(controller.sync('iiko', 'tenant-1')).rejects.toThrow(ConflictException);
    });

    it('re-throws unexpected errors', async () => {
      service.syncMenu.mockRejectedValue(new Error('DB error'));

      await expect(controller.sync('iiko', 'tenant-1')).rejects.toThrow('DB error');
    });
  });
});
