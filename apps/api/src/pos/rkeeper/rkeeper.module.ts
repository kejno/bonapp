import { Module } from '@nestjs/common';
import { RKeeperClientFactory } from './rkeeper.client-factory';
import { RKeeperMenuService } from './rkeeper.menu.service';
import { RKeeperOrderService } from './rkeeper.order.service';

@Module({
  providers: [RKeeperClientFactory, RKeeperMenuService, RKeeperOrderService],
  exports: [RKeeperClientFactory, RKeeperMenuService, RKeeperOrderService],
})
export class RKeeperModule {}
