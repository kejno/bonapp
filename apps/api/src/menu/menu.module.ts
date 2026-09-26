import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { GuestMenuController } from './guest-menu.controller';
import { MediaController, MenuCatalogController } from './menu-catalog.controller';
import { MenuCatalogService } from './menu-catalog.service';
import { MenuAdminController } from './menu-admin.controller';
import { MenuAdminService } from './menu-admin.service';
import { MenuService } from './menu.service';
import { MenuGateway } from './menu.gateway';
import { StopListController } from './stop-list.controller';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [
    GuestMenuController,
    StopListController,
    MenuCatalogController,
    MediaController,
    MenuAdminController,
  ],
  providers: [MenuService, MenuAdminService, MenuCatalogService, MenuGateway],
  exports: [MenuGateway],
})
export class MenuModule {}
