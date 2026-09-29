import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PosSyncController } from './pos-sync.controller';
import { PosOrderDispatcher } from './pos-order-dispatcher';
import { PosOrderQueueService } from './pos-order-queue.service';

@Module({
  controllers: [OnboardingController, PosSyncController],
  providers: [OnboardingService, PosOrderQueueService, { provide: PosOrderDispatcher, useExisting: PosOrderQueueService }],
  exports: [PosOrderDispatcher],
})
export class OnboardingModule {}
