import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { IikoModule } from './integrations/iiko/iiko.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, IikoModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
