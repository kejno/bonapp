import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { SknoApiService } from '../fiscal/skno/skno-api.service';
import { SKNO_API_SERVICE } from '../fiscal/skno/skno-api.interface';

@Module({
  providers: [
    ShiftsService,
    { provide: SKNO_API_SERVICE, useClass: SknoApiService },
  ],
  controllers: [ShiftsController],
})
export class ShiftsModule {}
