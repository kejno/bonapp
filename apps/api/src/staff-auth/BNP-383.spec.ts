import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { buildTokenPair } from './staff-jwt.util';

const SECRET = 'test-secret';
const protectedAction = jest.fn(() => ({ completed: true }));

@Controller('protected')
@UseGuards(JwtAuthGuard, RolesGuard)
class ProtectedRouteController {
  @Get()
  @Roles(UserRole.OWNER)
  execute() {
    return protectedAction();
  }
}

describe('BNP-383: protected route authentication and role checks', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const prisma = {
      forTenant: () => ({
        user: {
          findFirst: jest.fn(({ where }: { where: { id: string } }) =>
            Promise.resolve({
              isBlocked: false,
              mustChangePassword: false,
              sessionVersion: 0,
              role: where.id === 'owner-1' ? UserRole.OWNER : UserRole.WAITER,
            }),
          ),
        },
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [ProtectedRouteController],
      providers: [
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => SECRET },
        },
        { provide: PrismaService, useValue: prisma },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    protectedAction.mockClear();
  });

  it('returns 401 without a bearer token', async () => {
    await request(app.getHttpServer()).get('/protected').expect(401);

    expect(protectedAction).not.toHaveBeenCalled();
  });

  it('returns 403 for a valid JWT with a role that is not allowed and does not execute the action', async () => {
    const { accessToken } = buildTokenPair('waiter-1', 'tenant-1', UserRole.WAITER, SECRET);

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(protectedAction).not.toHaveBeenCalled();
  });

  it('returns the protected route response for a valid JWT with the allowed role', async () => {
    const { accessToken } = buildTokenPair('owner-1', 'tenant-1', UserRole.OWNER, SECRET);

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, { completed: true });

    expect(protectedAction).toHaveBeenCalledTimes(1);
  });
});
