import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  const corsAllowAll = config.get<boolean>('app.corsAllowAll') ?? false;
  const corsOrigins =
    config.get<string[]>('app.corsOrigins') ?? ['http://localhost:3000'];
  app.enableCors({
    // credentials + wildcard (*) is invalid — reflect the request origin instead
    origin: corsAllowAll ? true : corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = config.get<number>('app.port') || 4000;
  await app.listen(port);
  console.log(`MAAS API listening on http://localhost:${port}/api/v1`);
}
bootstrap();
