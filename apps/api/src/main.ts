import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Server } from 'socket.io';
import { OrdersEvents } from './orders/orders.events';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const io = new Server(app.getHttpServer(), { cors: { origin: '*' } });
  app.get(OrdersEvents).created.on('order:created', ({ tenantId, ...order }) => {
    io.to(`tenant_${tenantId}_kitchen`).emit('order:created', order);
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
