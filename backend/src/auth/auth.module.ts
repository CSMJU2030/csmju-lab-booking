import { Global, Module } from '@nestjs/common';
import { AuthEventsLogger } from './auth-events.logger';
import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import { JwksService } from './jwks.service';
import { MeController } from './me.controller';
import { SsoCallbackController } from './sso-callback.controller';
import { CoreHubJwtGuard } from './guards/core-hub-jwt.guard';
import { PermissionsGuard } from './guards/permissions.guard';

/**
 * Core Hub integration module. It contains NO login, registration, password or
 * session logic - authentication happens at the Core Hub (spec §7, §41).
 */
@Global()
@Module({
  controllers: [MeController, SsoCallbackController],
  providers: [AuthEventsLogger, JwksService, CoreHubTokenVerifier, CoreHubJwtGuard, PermissionsGuard],
  exports: [AuthEventsLogger, JwksService, CoreHubTokenVerifier, CoreHubJwtGuard, PermissionsGuard],
})
export class AuthModule {}
