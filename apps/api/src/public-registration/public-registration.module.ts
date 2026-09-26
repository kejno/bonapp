import { Module } from '@nestjs/common';
import { PublicRegistrationController } from './public-registration.controller';
import { PublicRegistrationService } from './public-registration.service';

@Module({ controllers: [PublicRegistrationController], providers: [PublicRegistrationService] })
export class PublicRegistrationModule {}
