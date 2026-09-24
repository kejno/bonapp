import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AreasController } from './areas.controller';
import { HallsService } from './halls.service';
import { TablesController } from './tables.controller';

@Module({
  imports: [AuthModule],
  controllers: [AreasController, TablesController],
  providers: [HallsService],
})
export class HallsModule {}
