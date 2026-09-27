import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PublicRegistrationController } from '../src/public-registration/public-registration.controller';
import { PublicRegistrationService } from '../src/public-registration/public-registration.service';

type RegistrationRecord = { email: string; tenantId: string };
type TestState = {
  tenants: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  registrations: RegistrationRecord[];
};

export async function createRegistrationTestApp() {
  const state: TestState = { tenants: [], users: [], registrations: [] };
  const prisma = {
    get unscopedClient() {
      return {
        tenantRegistration: {
          findUnique: jest.fn(({ where }: { where: { email: string } }) =>
            Promise.resolve(state.registrations.find((entry) => entry.email === where.email) ?? null),
          ),
        },
      };
    },
    unscopedTransaction: jest.fn(async (_tenantId: string, operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        tenant: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            if (state.tenants.some((tenant) => tenant.slug === data.slug)) {
              throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['slug'] } });
            }
            state.tenants.push(data);
            return Promise.resolve(data);
          }),
        },
        user: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            const user = { ...data, id: `user-${state.users.length + 1}`, sessionVersion: 0 };
            state.users.push(user);
            return Promise.resolve({ id: user.id, sessionVersion: user.sessionVersion });
          }),
        },
        tenantRegistration: {
          create: jest.fn(({ data }: { data: RegistrationRecord }) => {
            state.registrations.push(data);
            return Promise.resolve(data);
          }),
        },
      }),
    ),
  };
  const module = await Test.createTestingModule({
    controllers: [PublicRegistrationController],
    providers: [
      PublicRegistrationService,
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: { getOrThrow: () => 'registration-test-secret' } },
    ],
  }).compile();
  const app: INestApplication = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();

  return {
    app,
    state,
    register: (body: Record<string, unknown>) =>
      request(app.getHttpServer() as never).post('/api/v1/public/tenants/register').send(body),
  };
}

export const validRegistration = (overrides: Record<string, unknown> = {}) => ({
  name: 'Кафе Минск',
  email: 'owner@example.com',
  phone: '+375291234567',
  venueType: 'CAFE',
  ...overrides,
});
