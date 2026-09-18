import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GuestMenuService } from '../src/guest-menu/guest-menu.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Guest menu (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(GuestMenuService)
      .useValue({
        getMenu: jest.fn().mockResolvedValue({
          tableNumber: 12,
          categories: [{ id: 'starters', name: 'Закуски', dishes: [] }],
        }),
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  it('GET /api/v1/guest/menu returns categories for a table session token', () =>
    request(app.getHttpServer())
      .get('/api/v1/guest/menu')
      .set('X-Table-Session-Token', 'valid-token')
      .expect(200)
      .expect({
        tableNumber: 12,
        categories: [{ id: 'starters', name: 'Закуски', dishes: [] }],
      }));

  afterEach(async () => app.close());
});
