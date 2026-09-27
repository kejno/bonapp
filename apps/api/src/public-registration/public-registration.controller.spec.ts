import { APP_GUARD } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { PublicRegistrationController } from './public-registration.controller';
import { PublicRegistrationService } from './public-registration.service';

describe('PublicRegistrationController', () => {
  it('limits registration requests to five per minute per client', async () => {
    const appModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [PublicRegistrationController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: PublicRegistrationService, useValue: { register: jest.fn().mockResolvedValue({ accessToken: 'token' }) } },
      ],
    }).compile();
    const app: INestApplication<App> = appModule.createNestApplication();
    await app.init();

    try {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/public/tenants/register')
          .send({ name: 'Cafe', email: `owner${i}@example.com`, phone: '+375291234567', venueType: 'CAFE' })
          .expect(201);
      }
      await request(app.getHttpServer())
        .post('/public/tenants/register')
        .send({ name: 'Cafe', email: 'owner6@example.com', phone: '+375291234567', venueType: 'CAFE' })
        .expect(429);
    } finally {
      await app.close();
    }
  });
});
