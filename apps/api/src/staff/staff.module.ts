import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { ShiftService } from './shift.service';

@Module({
  imports: [AuthModule],
  controllers: [StaffController],
  providers: [StaffService, ShiftService],
})
export class StaffModule {}
