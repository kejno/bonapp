import { Module } from '@nestjs/common';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

@Module({
  imports: [StaffAuthModule],
  controllers: [SuperadminController],
  providers: [SuperadminService],
})
export class SuperadminModule {}
