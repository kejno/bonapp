import { Module } from '@nestjs/common';
import { AreasModule } from '../areas/areas.module';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [AreasModule],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
