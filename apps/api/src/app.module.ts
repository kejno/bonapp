import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { GuestSessionModule } from './guest-session/guest-session.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { HallsModule } from './halls/halls.module';
import { IikoModule } from './integrations/iiko/iiko.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PublicRegistrationModule } from './public-registration/public-registration.module';
import { PrismaModule } from './prisma/prisma.module';
import { StaffAuthModule } from './staff-auth/staff-auth.module';
import { StaffModule } from './staff/staff.module';
import { TenantContextMiddleware } from './tenant/tenant-context.middleware';
import { TenantGuard } from './tenant/tenant.guard';
import { TenantModule } from './tenant/tenant.module';
import { WaiterCallModule } from './waiter-call/waiter-call.module';
import { WelcomeModule } from './welcome/welcome.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SuperadminModule } from './superadmin/superadmin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    CacheModule,
    AuthModule,
    HallsModule,
    IikoModule,
    MenuModule,
    OrdersModule,
    OnboardingModule,
    TenantModule,
    StaffAuthModule,
    StaffModule,
    GuestSessionModule,
    IntegrationsModule,
    PublicRegistrationModule,
    WaiterCallModule,
    WelcomeModule,
    AnalyticsModule,
    SuperadminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
