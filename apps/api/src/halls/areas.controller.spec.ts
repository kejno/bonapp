import { BadRequestException } from '@nestjs/common';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { AreasController } from './areas.controller';
import { HallsService } from './halls.service';

describe('AreasController', () => {
  const service = { listAreas: jest.fn(), createArea: jest.fn() };
  const controller = new AreasController(service as unknown as HallsService);
  const req = { user: { tenantId: 'tenant-1' } } as TenantRequest;

  beforeEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('returns areas for the authenticated tenant', async () => {
      const areas = [{ id: 'a1' }, { id: 'a2' }];
      service.listAreas.mockResolvedValue(areas);

      const result = await controller.list(req);

      expect(service.listAreas).toHaveBeenCalledWith('tenant-1');
      expect(result).toBe(areas);
    });
  });

  describe('create', () => {
    it('creates an area using the tenant from the authenticated request', async () => {
      const area = { id: 'a1', name: 'VIP', sortOrder: 1 };
      service.createArea.mockResolvedValue(area);

      const result = await controller.create(req, { name: 'VIP', sortOrder: 1 });

      expect(service.createArea).toHaveBeenCalledWith('tenant-1', { name: 'VIP', sortOrder: 1 });
      expect(result).toBe(area);
    });

    it('trims the area name before sending to the service', async () => {
      service.createArea.mockResolvedValue({ id: 'a1', name: 'VIP' });

      await controller.create(req, { name: '  VIP  ' });

      expect(service.createArea).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ name: 'VIP' }),
      );
    });

    it('accepts sort_order from the Admin API payload', async () => {
      service.createArea.mockResolvedValue({ id: 'a1', name: 'VIP', sortOrder: 3 });

      await controller.create(req, { name: 'VIP', sort_order: 3 });

      expect(service.createArea).toHaveBeenCalledWith('tenant-1', {
        name: 'VIP',
        sortOrder: 3,
      });
    });

    it('ignores tenantId in the body and uses the authenticated tenant only', async () => {
      service.createArea.mockResolvedValue({ id: 'a1' });

      await controller.create(req, { name: 'Main Hall', tenantId: 'malicious-tenant' });

      expect(service.createArea).toHaveBeenCalledWith('tenant-1', expect.anything());
    });

    it.each([
      [{}],
      [{ name: '' }],
      [{ name: '   ' }],
      [{ name: 123 }],
      [{ name: 'Hall', sortOrder: 1.5 }],
      [{ name: 'Hall', sort_order: 1.5 }],
      [null],
    ])('throws BadRequestException for invalid payload %p', (body) => {
      expect(() => controller.create(req, body)).toThrow(BadRequestException);
      expect(service.createArea).not.toHaveBeenCalled();
    });
  });
});
