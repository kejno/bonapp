import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GuestMenuController } from './guest-menu.controller';
import { MenuAdminController } from './menu-admin.controller';
import { MenuAdminService } from './menu-admin.service';
import { MenuGateway } from './menu.gateway';
import { MenuService } from './menu.service';
import { StopListController } from './stop-list.controller';

@Module({
  imports: [AuthModule],
  controllers: [GuestMenuController, StopListController, MenuAdminController],
  providers: [MenuService, MenuAdminService, MenuGateway],
})
export class MenuModule {}
