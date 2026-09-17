import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { StaffModule } from './staff/staff.module';
import { ShiftsModule } from './shifts/shifts.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, StaffModule, ShiftsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
