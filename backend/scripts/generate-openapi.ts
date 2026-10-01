/**
 * Writes backend/openapi.json from the real controllers (tech-stack.md ข้อ 3).
 * No database or Core Hub is needed: PrismaService is replaced by an empty
 * stub, because building the document only reads route metadata.
 *
 *   pnpm --filter backend generate:openapi
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/openapi_only';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ROUTES_OUTSIDE_API_PREFIX, configureApp } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.setGlobalPrefix('api', { exclude: ROUTES_OUTSIDE_API_PREFIX });
  configureApp(app);
  await app.init();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CSMJU Lab Booking API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );

  writeFileSync(join(__dirname, '..', 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

void main();
