import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WelcomeController } from './welcome.controller';
import { WelcomeService } from './welcome.service';

@Module({ imports: [AuthModule], controllers: [WelcomeController], providers: [WelcomeService], exports: [WelcomeService] })
export class WelcomeModule {}
