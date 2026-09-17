import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionPlan } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { planPricesConfig } from '../src/config/plan-prices.config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SuperAdminModule } from '../src/superadmin/superadmin.module';

const TEST_SECRET = 'test-secret-for-integration';

function makeToken(role: string, scope?: string): string {
  return jwt.sign(
    { sub: 'uid1', email: 'admin@test.com', role, tenantId: null, scope },
    TEST_SECRET,
  );
}

const mockPrisma = {
  tenant: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  order: {
    count: jest.fn(),
  },
};

describe('SuperAdmin API (integration)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.PLAN_PRICE_STANDARD = '29';
    process.env.PLAN_PRICE_PRO = '79';
    process.env.PLAN_PRICE_ENTERPRISE = '199';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [planPricesConfig] }),
        PrismaModule,
        SuperAdminModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/superadmin/tenants', () => {
    it('returns 200 for SUPER_ADMIN with superadmin scope', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        {
          id: 'tid1',
          name: 'Cafe A',
          slug: 'cafe-a',
          subscriptionPlan: SubscriptionPlan.PRO,
          isActive: true,
          trialEndsAt: null,
          _count: { orders: 5 },
        },
      ]);

      await request(app.getHttpServer())
        .get('/api/v1/superadmin/tenants')
        .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', 'superadmin')}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(1);
          expect(res.body[0].plan).toBe(SubscriptionPlan.PRO);
          expect(res.body[0].monthlyRevenueByn).toBe(79);
        });
    });

    it('returns 403 for OWNER role', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/superadmin/tenants')
        .set('Authorization', `Bearer ${makeToken('OWNER')}`)
        .expect(403);
    });

    it('returns 403 for SUPER_ADMIN without superadmin scope', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/superadmin/tenants')
        .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`)
        .expect(403);
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/superadmin/tenants')
        .expect(401);
    });
  });

  describe('PATCH /api/v1/superadmin/tenants/:id', () => {
    it('updates subscription_plan and returns updated tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tid1' });
      mockPrisma.tenant.update.mockResolvedValue({
        id: 'tid1',
        name: 'Cafe A',
        slug: 'cafe-a',
        subscriptionPlan: SubscriptionPlan.ENTERPRISE,
        isActive: true,
        trialEndsAt: null,
        _count: { orders: 3 },
      });

      await request(app.getHttpServer())
        .patch('/api/v1/superadmin/tenants/tid1')
        .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', 'superadmin')}`)
        .send({ subscriptionPlan: SubscriptionPlan.ENTERPRISE })
        .expect(200)
        .expect((res) => {
          expect(res.body.plan).toBe(SubscriptionPlan.ENTERPRISE);
          expect(res.body.monthlyRevenueByn).toBe(199);
        });
    });

    it('returns 404 for unknown tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/v1/superadmin/tenants/nonexistent')
        .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', 'superadmin')}`)
        .send({ isActive: false })
        .expect(404);
    });

    it('returns 403 for OWNER role', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/superadmin/tenants/tid1')
        .set('Authorization', `Bearer ${makeToken('OWNER')}`)
        .send({ subscriptionPlan: SubscriptionPlan.PRO })
        .expect(403);
    });
  });

  describe('GET /api/v1/superadmin/platform/stats', () => {
    it('returns platform stats with correct MRR for SUPER_ADMIN', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { subscriptionPlan: SubscriptionPlan.PRO, isActive: true },
        { subscriptionPlan: SubscriptionPlan.STANDARD, isActive: true },
        { subscriptionPlan: SubscriptionPlan.TRIAL, isActive: false },
      ]);
      mockPrisma.order.count.mockResolvedValue(12);

      await request(app.getHttpServer())
        .get('/api/v1/superadmin/platform/stats')
        .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN', 'superadmin')}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.mrrByn).toBe(108); // PRO(79) + STANDARD(29)
          expect(res.body.totalTenants).toBe(3);
          expect(res.body.activeTenants).toBe(2);
          expect(res.body.qrOrdersToday).toBe(12);
        });
    });
  });
});
