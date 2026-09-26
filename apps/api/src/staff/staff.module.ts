import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { ShiftsController } from './shifts.controller';

@Module({ imports: [AuthModule], controllers: [StaffController, ShiftsController], providers: [StaffService] })
export class StaffModule {}
