import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PosController } from './pos.controller';
import { PosQueueService } from './pos-queue.service';
import { PosService } from './pos.service';
import { PosWorkerService } from './pos-worker.service';
import { RKeeperModule } from './rkeeper/rkeeper.module';

@Module({
  imports: [ConfigModule, RKeeperModule],
  controllers: [PosController],
  providers: [PosService, PosQueueService, PosWorkerService],
  exports: [PosService],
})
export class PosModule {}
