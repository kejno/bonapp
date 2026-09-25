import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GuestSessionController } from '../src/guest-session/guest-session.controller';
import { GuestSessionService } from '../src/guest-session/guest-session.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('BNP-377: guest session by QR token', () => {
  let app: INestApplication;
  const prisma = {
    findTableByQrToken: jest.fn(),
    forTenant: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GuestSessionController],
      providers: [GuestSessionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => app?.close());

  it('returns tenant, table, and active order for a valid QR token', async () => {
    prisma.findTableByQrToken.mockResolvedValue({
      id: 'table-1',
      tenantId: 'tenant-1',
      tableNumber: 5,
      tenant: {
        id: 'tenant-1',
        name: 'Test Restaurant',
        slug: 'test-restaurant',
        logoUrl: 'https://example.com/logo.png',
        brandColor: '#e0533c',
        currency: 'BYN',
      },
      area: { name: 'Main Hall' },
    });
    const createdAt = new Date('2026-09-25T10:00:00.000Z');
    prisma.forTenant.mockReturnValue({
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', status: 'NEW', createdAt }) },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/guest/session/valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      tenant: {
        id: 'tenant-1',
        name: 'Test Restaurant',
        slug: 'test-restaurant',
        logoUrl: 'https://example.com/logo.png',
        brandColor: '#e0533c',
        currency: 'BYN',
      },
      table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' },
      activeOrder: { id: 'order-1', status: 'NEW', createdAt: createdAt.toISOString() },
    });
    expect(prisma.findTableByQrToken).toHaveBeenCalledWith('valid-token');
  });
});
