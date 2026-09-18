import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { ShiftsModule } from './shifts/shifts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    FiscalModule,
    ShiftsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
