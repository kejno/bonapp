import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { GuestMenuController } from './guest-menu/guest-menu.controller';
import { GuestMenuService } from './guest-menu/guest-menu.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [AppController, GuestMenuController],
  providers: [AppService, GuestMenuService],
})
export class AppModule {}
