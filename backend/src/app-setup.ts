import { RequestMethod, ValidationPipe } from '@nestjs/common';
import type { RouteInfo } from '@nestjs/common/interfaces';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TrustProxy } from './config/configuration';

/**
 * Routes that stay at the root instead of under the `/api` prefix: the central
 * SSO endpoints. /auth/callback is the URL registered for this subsystem in
 * the Core Hub Subsystem Registry, and auth-contract 5 fixes /auth/login and
 * /auth/logout next to it.
 *
 * main.ts declares `setGlobalPrefix('api', ...)` itself - API-02 of
 * csmju2030-standards looks for it there - and the e2e suites pass this same
 * list, so neither can drift from the other.
 */
export const ROUTES_OUTSIDE_API_PREFIX: RouteInfo[] = [
  { path: 'auth/login', method: RequestMethod.GET },
  { path: 'auth/callback', method: RequestMethod.GET },
  { path: 'auth/logout', method: RequestMethod.POST },
];

/**
 * The rest of what main.ts applies before it listens, shared with the e2e
 * suites so they boot what production runs instead of a hand-copied
 * approximation.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  // Rate limiting buckets callers by `request.ip`. Behind a reverse proxy every
  // caller would otherwise share the proxy's address and land in one bucket.
  // Trusting the forwarded header when NO proxy rewrites it is worse than not
  // trusting it at all, because then a caller picks its own bucket - so this
  // stays off until the deployment says which hops are its own (TRUST_PROXY).
  // X-Forwarded-For is never read by hand anywhere else.
  const trustProxy = config.get<TrustProxy>('trustProxy', false);
  if (trustProxy !== false) {
    app.set('trust proxy', trustProxy);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
}
