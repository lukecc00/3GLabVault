import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

function getConfiguredEnvValue(value: string | undefined, fallback: string) {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : fallback;
}

function buildBaseUrl(protocol: string, host: string, port?: string) {
  const normalizedProtocol = protocol.replace(/:$/, '');
  const normalizedPort = port?.trim();

  return `${normalizedProtocol}://${host}${normalizedPort ? `:${normalizedPort}` : ''}`;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const httpAdapter = app.getHttpAdapter();
  const httpServer = httpAdapter.getInstance();
  const defaultCorsOrigin = buildBaseUrl(
    getConfiguredEnvValue(process.env.WEB_PROTOCOL, 'http'),
    getConfiguredEnvValue(process.env.WEB_HOST, 'localhost'),
    getConfiguredEnvValue(process.env.WEB_PORT, '3000'),
  );
  const corsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (typeof httpServer.set === 'function') {
    httpServer.set('trust proxy', true);
  }

  app.setGlobalPrefix('api');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: corsOrigins?.length ? corsOrigins : [defaultCorsOrigin],
    credentials: true,
  });

  await app.listen(
    getConfiguredEnvValue(process.env.PORT, '3001'),
    getConfiguredEnvValue(process.env.HOST, 'localhost'),
  );
}
void bootstrap();
