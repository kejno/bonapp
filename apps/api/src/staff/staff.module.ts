import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { ShiftService } from './shift.service';
import { FiscalizationService } from './fiscalization.service';
import { SKNO_CLIENT, SKNO_FISCAL_CLIENT, TitanSknoClient } from './skno-client';

@Module({
  imports: [AuthModule],
  controllers: [StaffController],
  providers: [
    StaffService,
    ShiftService,
    TitanSknoClient,
    { provide: SKNO_CLIENT, useExisting: TitanSknoClient },
    { provide: SKNO_FISCAL_CLIENT, useExisting: TitanSknoClient },
    FiscalizationService,
  ],
  exports: [ShiftService, FiscalizationService],
})
export class StaffModule {}
