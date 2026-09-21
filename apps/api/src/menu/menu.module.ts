import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuestMenuController } from './guest-menu.controller';
import { MenuAdminService } from './menu-admin.service';
import { MenuService } from './menu.service';
import { StopListController } from './stop-list.controller';

@Module({
  imports: [AuthModule],
  controllers: [GuestMenuController, StopListController],
  providers: [MenuService, MenuAdminService],
})
export class MenuModule {}
