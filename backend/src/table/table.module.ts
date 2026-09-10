import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderModule } from '../order/order.module.js';
import { Tenant } from '../identity/entities/tenant.entity.js';
import { IdentityModule } from '../identity/identity.module.js';
import { PublicTableController } from './public-table.controller.js';
import { Table } from './entities/table.entity.js';
import { TableController } from './table.controller.js';
import { TableService } from './table.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Table, Tenant]),
    OrderModule,
    IdentityModule,
  ],
  controllers: [TableController, PublicTableController],
  providers: [TableService],
})
export class TableModule {}
