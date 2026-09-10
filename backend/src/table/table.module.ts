import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../order/entities/order.entity.js';
import { Tenant } from '../identity/entities/tenant.entity.js';
import { IdentityModule } from '../identity/identity.module.js';
import { PublicTableController } from './public-table.controller.js';
import { Table } from './entities/table.entity.js';
import { TableController } from './table.controller.js';
import { TableService } from './table.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Table, Order, Tenant]),
    IdentityModule,
  ],
  controllers: [TableController, PublicTableController],
  providers: [TableService],
})
export class TableModule {}
