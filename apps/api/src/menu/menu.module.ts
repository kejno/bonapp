import { Module } from '@nestjs/common';
import { MenuCacheService } from './menu-cache.service';
import { MenuController } from './menu.controller';
import { MenuGateway } from './menu.gateway';
import { MenuNotifierService } from './menu-notifier.service';
import { MenuService } from './menu.service';

@Module({
  controllers: [MenuController],
  providers: [
    MenuService,
    MenuCacheService,
    MenuGateway,
    { provide: MenuNotifierService, useExisting: MenuGateway },
  ],
})
export class MenuModule {}
