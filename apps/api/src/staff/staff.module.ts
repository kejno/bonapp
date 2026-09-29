import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { ShiftService } from './shift.service';
import { SKNO_CLIENT, TitanSknoClient } from './skno-client';

@Module({
  imports: [AuthModule],
  controllers: [StaffController],
  providers: [StaffService, ShiftService, TitanSknoClient, { provide: SKNO_CLIENT, useExisting: TitanSknoClient }],
  exports: [ShiftService],
})
export class StaffModule {}
