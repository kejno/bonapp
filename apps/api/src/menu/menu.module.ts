import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MenuCacheService } from './menu-cache.service';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  controllers: [MenuController, MediaController],
  providers: [MenuService, MenuCacheService, MediaService],
})
export class MenuModule {}
