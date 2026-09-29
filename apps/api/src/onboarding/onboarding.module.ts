import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { PosSyncController } from './pos-sync.controller';

@Module({ controllers: [OnboardingController, PosSyncController], providers: [OnboardingService] })
export class OnboardingModule {}
