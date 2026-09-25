import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { trustedProxySetting } from './trusted-proxies';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (setting: string, value: false | string[]) => void;
  };
  expressApp.set(
    'trust proxy',
    trustedProxySetting(process.env.TRUSTED_PROXY_ADDRESSES),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
