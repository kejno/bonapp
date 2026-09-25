import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GuestSessionController } from '../src/guest-session/guest-session.controller';
import { GuestSessionService } from '../src/guest-session/guest-session.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('BNP-378: unknown guest QR token', () => {
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

  it('returns 404 when the QR token does not resolve to a table', async () => {
    prisma.findTableByQrToken.mockResolvedValue(null);

    const response = await request(app.getHttpServer())
      .get('/api/v1/guest/session/unknown-token');

    expect(response.status).toBe(404);
    expect(prisma.findTableByQrToken).toHaveBeenCalledWith('unknown-token');
  });
});
