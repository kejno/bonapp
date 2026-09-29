import { Module } from '@nestjs/common';
import { IikoModule } from '../integrations/iiko/iiko.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PosSyncController } from './pos-sync.controller';
import { PosOrderDispatcher } from './pos-order-dispatcher';
import { PosOrderQueueService } from './pos-order-queue.service';

@Module({
  imports: [IikoModule],
  controllers: [OnboardingController, PosSyncController],
  providers: [OnboardingService, PosOrderQueueService, { provide: PosOrderDispatcher, useExisting: PosOrderQueueService }],
  exports: [OnboardingService, PosOrderDispatcher],
})
export class OnboardingModule {}
