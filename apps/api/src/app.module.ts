import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './events/events.module';
import { GuestModule } from './guest/guest.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { QueuesModule } from './queues/queues.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventsModule,
    GuestModule,
    WebhooksModule,
    QueuesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
