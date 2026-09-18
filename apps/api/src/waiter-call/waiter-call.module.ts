import { Module } from '@nestjs/common';
import { WaiterCallController } from './waiter-call.controller';
import { TableSessionTokenService } from './table-session-token.service';
import { WaiterCallGateway } from './waiter-call.gateway';
import { WaiterCallService } from './waiter-call.service';

@Module({
  controllers: [WaiterCallController],
  providers: [TableSessionTokenService, WaiterCallGateway, WaiterCallService],
})
export class WaiterCallModule {}
