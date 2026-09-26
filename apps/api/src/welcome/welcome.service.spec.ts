import { PrismaService } from '../prisma/prisma.service';
import { WelcomeService } from './welcome.service';

describe('WelcomeService', () => {
  it('reports each readiness condition independently and shows zero states', async () => {
    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        menuItem: { count: jest.fn().mockResolvedValue(1) },
        table: { count: jest.fn().mockResolvedValue(0) },
        order: { count: jest.fn().mockResolvedValue(0) },
        shift: { findFirst: jest.fn().mockResolvedValue(null) },
      }),
    };
    const service = new WelcomeService(prisma as unknown as PrismaService);

    await expect(service.getReadiness('tenant-a')).resolves.toEqual({
      menuReady: true,
      tablesReady: false,
      paymentsReady: false,
      hasOrders: false,
      hasActiveShift: false,
      canSimulateOrder: false,
    });
    expect(prisma.forTenant).toHaveBeenCalledWith('tenant-a');
  });

  it('enables test order simulation only when both an active menu item and a table exist', async () => {
    const count = jest.fn().mockResolvedValue(2);
    const prisma = {
      forTenant: jest.fn().mockReturnValue({
        menuItem: { count: jest.fn().mockResolvedValue(1) },
        table: { count },
        order: { count: jest.fn().mockResolvedValue(4) },
        shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1' }) },
      }),
    };
    const service = new WelcomeService(prisma as unknown as PrismaService);

    await expect(service.getReadiness('tenant-a')).resolves.toMatchObject({
      menuReady: true,
      tablesReady: true,
      hasOrders: true,
      hasActiveShift: true,
      canSimulateOrder: true,
    });
  });
});
