import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { MenuModule } from './menu/menu.module.js';
import { OrderModule } from './order/order.module.js';
import { TableModule } from './table/table.module.js';
import { IdentityModule } from './identity/identity.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    TenantModule,
    MenuModule,
    OrderModule,
    TableModule,
    IdentityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
