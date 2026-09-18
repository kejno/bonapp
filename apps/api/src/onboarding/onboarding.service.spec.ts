import { ConflictException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  const prisma = {
    tenant: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const service = new OnboardingService(prisma as never);
  const input = {
    tenantId: 'tenant-1',
    name: 'Cafe',
    slug: 'cafe',
    legalName: 'Cafe LLC',
    unp: '123456789',
    address: 'Minsk',
    timezone: 'Europe/Minsk',
  };

  beforeEach(() => jest.clearAllMocks());

  it('saves a valid step one profile with Europe/Minsk timezone', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.tenant.upsert.mockResolvedValue({ id: 'tenant-1', slug: 'cafe' });

    await expect(service.saveStep1(input)).resolves.toEqual({ id: 'tenant-1', slug: 'cafe' });
    expect(prisma.tenant.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ timezone: 'Europe/Minsk' }),
    }));
  });

  it('rejects a slug claimed by another tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-2' });

    await expect(service.saveStep1(input)).rejects.toBeInstanceOf(ConflictException);
  });
});
