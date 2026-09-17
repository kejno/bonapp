import { Test, TestingModule } from '@nestjs/testing';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';
import { SuperAdminGuard } from '../guards/super-admin.guard';

const mockService = {
  getMetrics: jest.fn(),
  getTenants: jest.fn(),
  changePlan: jest.fn(),
  blockTenant: jest.fn(),
  unblockTenant: jest.fn(),
  extendTrial: jest.fn(),
};

describe('SuperadminController', () => {
  let controller: SuperadminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperadminController],
      providers: [{ provide: SuperadminService, useValue: mockService }],
    })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<SuperadminController>(SuperadminController);
    jest.clearAllMocks();
  });

  it('getMetrics delegates to service', async () => {
    const metrics = { mrr: 1000, activeTenants: 5, ordersToday: 12, mrrHistory: [] };
    mockService.getMetrics.mockResolvedValue(metrics);

    const result = await controller.getMetrics();

    expect(mockService.getMetrics).toHaveBeenCalled();
    expect(result).toEqual(metrics);
  });

  it('getTenants passes filters to service', async () => {
    mockService.getTenants.mockResolvedValue({ data: [], total: 0 });

    await controller.getTenants('PRO', 'ACTIVE');

    expect(mockService.getTenants).toHaveBeenCalledWith({ plan: 'PRO', status: 'ACTIVE' });
  });

  it('getTenants works without filters', async () => {
    mockService.getTenants.mockResolvedValue({ data: [], total: 0 });

    await controller.getTenants(undefined, undefined);

    expect(mockService.getTenants).toHaveBeenCalledWith({ plan: undefined, status: undefined });
  });

  it('changePlan delegates to service', async () => {
    const tenant = { id: 'tid-1', plan: 'ENTERPRISE' };
    mockService.changePlan.mockResolvedValue(tenant);

    const result = await controller.changePlan('tid-1', { plan: 'ENTERPRISE' });

    expect(mockService.changePlan).toHaveBeenCalledWith('tid-1', 'ENTERPRISE');
    expect(result).toEqual(tenant);
  });

  it('blockTenant delegates to service', async () => {
    mockService.blockTenant.mockResolvedValue({ id: 'tid-1', status: 'BLOCKED' });

    await controller.blockTenant('tid-1');

    expect(mockService.blockTenant).toHaveBeenCalledWith('tid-1');
  });

  it('unblockTenant delegates to service', async () => {
    mockService.unblockTenant.mockResolvedValue({ id: 'tid-1', status: 'ACTIVE' });

    await controller.unblockTenant('tid-1');

    expect(mockService.unblockTenant).toHaveBeenCalledWith('tid-1');
  });

  it('extendTrial delegates to service', async () => {
    mockService.extendTrial.mockResolvedValue({ id: 'tid-1', trialEndsAt: '2026-10-17T00:00:00.000Z' });

    await controller.extendTrial('tid-1');

    expect(mockService.extendTrial).toHaveBeenCalledWith('tid-1');
  });
});
