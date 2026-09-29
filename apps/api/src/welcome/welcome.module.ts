import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffModule } from '../staff/staff.module';
import { WelcomeController } from './welcome.controller';
import { WelcomeService } from './welcome.service';

@Module({ imports: [AuthModule, StaffModule], controllers: [WelcomeController], providers: [WelcomeService], exports: [WelcomeService] })
export class WelcomeModule {}
