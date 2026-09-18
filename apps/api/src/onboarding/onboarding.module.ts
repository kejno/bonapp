import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PosClientService } from './pos-client.service';

const menuImportQueueProvider = {
  provide: Queue,
  useFactory: () =>
    new Queue('menu-import', {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
};

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, PosClientService, menuImportQueueProvider],
})
export class OnboardingModule {}
