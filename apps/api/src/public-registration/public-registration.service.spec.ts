import { ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicRegistrationService, createTenantSlug } from './public-registration.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PublicRegistrationService', () => {
  const tx = {
    tenant: { create: jest.fn<Promise<{ id: string; slug: string }>, [Record<string, unknown>]>() },
    user: { create: jest.fn<Promise<{ id: string; sessionVersion: number }>, [Record<string, unknown>]>() },
    tenantRegistration: { create: jest.fn<Promise<unknown>, [Record<string, unknown>]>() },
  };
  const prisma = {
    unscopedClient: { tenantRegistration: { findUnique: jest.fn<Promise<{ email: string } | null>, [Record<string, unknown>]>() } },
    unscopedTransaction: jest.fn<Promise<unknown>, [string, (transaction: typeof tx) => Promise<unknown>]>()
  };
  let service: PublicRegistrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.unscopedTransaction.mockImplementation((_tenantId, fn) => Promise.resolve(fn(tx)));
    prisma.unscopedClient.tenantRegistration.findUnique.mockResolvedValue(null);
    tx.tenant.create.mockResolvedValue({ id: 'tenant-1', slug: 'pinokkio' });
    tx.user.create.mockResolvedValue({ id: 'user-1', sessionVersion: 0 });
    tx.tenantRegistration.create.mockResolvedValue({});
    service = new PublicRegistrationService(prisma as unknown as PrismaService, { getOrThrow: () => 'test-secret' } as unknown as ConfigService);
  });

  it('normalizes Cyrillic names, removes punctuation and limits the base slug', () => {
    expect(createTenantSlug('Кафе — У Пети!')).toBe('kafe-u-peti');
    expect(createTenantSlug('Ж'.repeat(100))).toHaveLength(60);
  });

  it('creates a trial tenant and owner and returns a short-lived access token', async () => {
    const result = await service.register({ name: 'Пиноккио', email: 'owner@example.com', phone: '+375291234567', venueType: 'RESTAURANT' });
    expect(JSON.stringify(tx.tenant.create.mock.calls[0]?.[0])).toContain('"slug":"pinokkio"');
    expect(JSON.stringify(tx.tenant.create.mock.calls[0]?.[0])).toContain('"status":"TRIAL"');
    expect(JSON.stringify(tx.user.create.mock.calls[0]?.[0])).toContain('"mustChangePassword":true');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.user.email).toBe('owner@example.com');
    expect(typeof result.accessToken).toBe('string');
    const payload = JSON.parse(Buffer.from(result.accessToken.split('.')[1], 'base64url').toString()) as { exp: number; iat: number };
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(86400);
  });

  it('rejects an email already registered', async () => {
    prisma.unscopedClient.tenantRegistration.findUnique.mockResolvedValue({ email: 'owner@example.com' });
    await expect(service.register({ name: 'Cafe', email: 'owner@example.com', phone: '+375291234567', venueType: 'CAFE' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.unscopedTransaction).not.toHaveBeenCalled();
  });

  it('rejects invalid Belarusian phones and email addresses', async () => {
    await expect(service.register({ name: 'Cafe', email: 'bad', phone: '+123', venueType: 'CAFE' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('increments a colliding slug until free', async () => {
    prisma.unscopedTransaction.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('slug conflict'), { code: 'P2002', meta: { target: ['slug'] } })));
    const result = await service.register({ name: 'Пиноккио', email: 'owner@example.com', phone: '+375291234567', venueType: 'BAR' });
    expect(JSON.stringify(tx.tenant.create.mock.calls.at(-1)?.[0])).toContain('"slug":"pinokkio-2"');
    expect(result.tenantId).toBe('tenant-1');
  });
});
