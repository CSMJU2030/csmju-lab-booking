import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ROUTES_OUTSIDE_API_PREFIX, configureApp } from './app-setup';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });
  const config = app.get(ConfigService);

  // /api/health and /api/v1/... (spec §20-§21); the SSO endpoints stay at the root.
  app.setGlobalPrefix('api', { exclude: ROUTES_OUTSIDE_API_PREFIX });

  // Trust proxy and validation - shared with the e2e suites.
  configureApp(app);

  app.enableShutdownHooks();

  const port = config.get<number>('port', 3003);
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(
    JSON.stringify({
      event: 'subsystem.started',
      subsystem: config.get<string>('subsystemId'),
      port,
      coreHubUrl: config.get<string>('coreHub.url'),
      coreHubWebUrl: config.get<string>('coreHub.webUrl'),
      jwksUrl: config.get<string>('coreHub.jwksUrl'),
      issuer: config.get<string>('coreHub.issuer'),
      audience: config.get<string>('coreHub.audience'),
    }),
  );
}

void bootstrap();
