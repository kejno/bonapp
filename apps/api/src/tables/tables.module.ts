import { Module } from '@nestjs/common';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  controllers: [TablesController, ZonesController],
  providers: [TablesService, ZonesService],
})
export class TablesModule {}
