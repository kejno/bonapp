import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, OnboardingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
