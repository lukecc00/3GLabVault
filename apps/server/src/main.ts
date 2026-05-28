import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertSecureRuntimeConfig } from './security/runtime-security';

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
  assertSecureRuntimeConfig();

  const app = await NestFactory.create(AppModule);
  const httpAdapter = app.getHttpAdapter();
  const httpServer = httpAdapter.getInstance();
  const isProduction = process.env.NODE_ENV?.trim().toLowerCase() === 'production';
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
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: {
        policy: 'same-site',
      },
      referrerPolicy: {
        policy: 'strict-origin',
      },
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
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
    getConfiguredEnvValue(process.env.HOST, '0.0.0.0'),
  );
}
void bootstrap();
