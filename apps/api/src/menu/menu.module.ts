import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { GuestMenuController } from './guest-menu.controller';
import { MediaController, MenuCatalogController } from './menu-catalog.controller';
import { MenuCatalogService } from './menu-catalog.service';
import { MenuAdminService } from './menu-admin.service';
import { MenuService } from './menu.service';
import { StopListController } from './stop-list.controller';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [GuestMenuController, StopListController, MenuCatalogController, MediaController],
  providers: [MenuService, MenuAdminService, MenuCatalogService],
})
export class MenuModule {}
