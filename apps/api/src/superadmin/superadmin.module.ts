import { Module } from '@nestjs/common';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { MenuModule } from '../menu/menu.module';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

@Module({ imports: [StaffAuthModule, MenuModule], controllers: [SuperadminController], providers: [SuperadminService] })
export class SuperadminModule {}
