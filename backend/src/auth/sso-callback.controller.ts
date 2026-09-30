import { Controller, Get, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AppException } from '../common/errors';
import { AuthEventsLogger } from './auth-events.logger';
import { TokenRejectionReason, TokenVerificationError } from './auth.errors';
import { CoreHubTokenPayload } from './core-hub-identity';
import { CoreHubTokenVerifier } from './core-hub-token.verifier';
import { Public } from './decorators/public.decorator';
import { SsoCallbackQueryDto } from './dto/sso-callback.dto';
import { SUBSYSTEM_BLOCKED_NEXT, safeNextPath } from './next-path';
import { mapCoreRoleToSubsystemRole } from './role-mapping';
import {
  SSO_STATE_COOKIE_PATH,
  buildCookieRemoval,
  buildSsoCookie,
  buildSsoStateCookie,
  createSsoState,
  readSsoState,
  ssoCookieNames,
  timingSafeEqualString,
} from './sso-session';

/**
 * Central SSO endpoints (auth-contract 5), all outside the `/api` prefix:
 *
 *   GET  /auth/login     starts every sign-in and mints the anti-forgery state
 *   GET  /auth/callback  the URL registered for this subsystem in Core Hub
 *   POST /auth/logout    drops this subsystem's cookies and signs out of Core Hub
 *
 * Every sign-in starts here, at /auth/login, because only the subsystem knows
 * which sign-ins it began - that is what protects the callback against login
 * CSRF. None of these endpoints shows a form: the password is only ever typed
 * at Core Hub (SEC-05).
 *
 * The subsystem keeps no session of its own. The verified Core Hub token is
 * the session, stored in an HttpOnly cookie that expires with it; when it
 * does, the frontend sends the browser through /auth/login again and Core Hub
 * renews it without asking for the password (silent re-SSO).
 */
@Controller('auth')
export class SsoCallbackController {
  private readonly names: { session: string; state: string };

  constructor(
    private readonly verifier: CoreHubTokenVerifier,
    private readonly authEvents: AuthEventsLogger,
    private readonly config: ConfigService,
  ) {
    this.names = ssoCookieNames(this.config.get<string>('subsystemId', 'csmju-lab-booking'));
  }

  private get secure(): boolean {
    return this.config.get<string>('nodeEnv') === 'production';
  }

  private get coreHubWebUrl(): string {
    return this.config.get<string>('coreHub.webUrl', 'http://localhost:3100').replace(/\/+$/, '');
  }

  private get defaultLanding(): string {
    return this.config.get<string>('sso.postLoginRedirect', '/api/v1/me');
  }

  /**
   * Starts a sign-in: mints a single-use state, keeps it (with the page to
   * return to) in a cookie only the callback receives, and sends the browser
   * to Core Hub's web app, which signs the user in or renews their session.
   *
   * No callback_url is sent: Core Hub only ever redirects to the one in its
   * registry, and refuses a different one with 400.
   */
  @Public()
  @Get('login')
  login(@Query('next') next: unknown, @Res() response: Response): void {
    const state = createSsoState();
    const landing = safeNextPath(next, SUBSYSTEM_BLOCKED_NEXT) ?? this.defaultLanding;

    const target = new URL(`${this.coreHubWebUrl}/sso/authorize`);
    target.searchParams.set('subsystem', this.config.get<string>('subsystemId', ''));
    target.searchParams.set('state', state);

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Set-Cookie',
      buildSsoStateCookie(
        this.names.state,
        state,
        landing,
        this.config.get<number>('sso.stateTtlSec', 600),
        this.secure,
      ),
    );
    response.redirect(HttpStatus.FOUND, target.toString());
  }

  /**
   * Where Core Hub sends the browser with a token. Three outcomes (SSO spec D3):
   *
   *  - no `state`: Core Hub started this sign-in itself, e.g. a sidebar click.
   *    The token is dropped unused and the browser restarts at /auth/login,
   *    which comes back here with a state this subsystem can check. A link
   *    carrying an attacker's token therefore signs the victim in as the
   *    victim, never as the attacker.
   *  - a `state` that does not match the cookie: 401, and no redirect - if
   *    the browser refuses cookies, redirecting again would loop forever.
   *  - a matching state and a valid token: the token becomes the session
   *    cookie and the browser goes to the page it started from.
   *
   * The URL carries the access token, so it is never logged - only the path.
   */
  @Public()
  @Get('callback')
  async callback(
    @Req() request: Request,
    @Query() query: SsoCallbackQueryDto,
    // Not passthrough: this handler ends every response itself with a
    // redirect, so Nest must not try to send a body after it.
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    // The next page must not receive this token-bearing URL as its Referer.
    response.setHeader('Referrer-Policy', 'no-referrer');

    if (query.state === undefined) {
      // The state cookie is left alone: another tab may be mid-sign-in and
      // waiting for its own callback.
      this.authEvents.jwtRejected({
        reason: TokenRejectionReason.SSO_RESTART_WITHOUT_STATE,
        path: '/auth/callback',
      });
      response.redirect(HttpStatus.FOUND, '/auth/login');
      return;
    }

    // The state is single use whatever happens next, so the removal is set
    // before any check: a rejected callback burns the state too.
    const saved = readSsoState(request.header('cookie'), this.names.state);
    const stateRemoval = buildCookieRemoval(this.names.state, SSO_STATE_COOKIE_PATH, this.secure);
    response.setHeader('Set-Cookie', [stateRemoval]);

    if (!saved || !timingSafeEqualString(saved.state, query.state)) {
      this.authEvents.jwtRejected({
        reason: saved
          ? TokenRejectionReason.SSO_STATE_MISMATCH
          : TokenRejectionReason.SSO_STATE_MISSING,
        path: '/auth/callback',
      });
      throw AppException.unauthorized(
        'This sign-in did not start here. Start again at /auth/login.',
      );
    }

    const payload = await this.verifyOrThrow(query.access_token);
    const subsystemRole = mapCoreRoleToSubsystemRole(payload.role);

    if (!subsystemRole) {
      this.authEvents.roleMappingFailed({ sub: payload.sub, coreRole: payload.role });
      throw AppException.forbidden('Your Core Hub role has no access to this subsystem');
    }

    response.setHeader('Set-Cookie', [
      stateRemoval,
      buildSsoCookie(
        this.names.session,
        query.access_token,
        this.remainingLifetimeSec(payload.exp),
        this.secure,
      ),
    ]);

    this.authEvents.jwtVerified({ sub: payload.sub, coreRole: payload.role, subsystemRole });

    // The landing came back from a cookie, so it is checked again here.
    response.redirect(
      HttpStatus.FOUND,
      safeNextPath(saved.landing, SUBSYSTEM_BLOCKED_NEXT) ?? this.defaultLanding,
    );
  }

  /**
   * Signs out everywhere (SSO spec D8). Dropping only this subsystem's cookie
   * would be undone by the next click, which Core Hub - still signed in -
   * would answer with a fresh token. So the browser goes on to Core Hub's
   * /logout, where the user confirms ending the Core Hub session.
   *
   * Public on purpose: it must work with an expired or missing session, and
   * all it does is clear this subsystem's own cookies.
   */
  @Public()
  @Post('logout')
  logout(@Res() response: Response): void {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', [
      buildCookieRemoval(this.names.session, '/', this.secure),
      buildCookieRemoval(this.names.state, SSO_STATE_COOKIE_PATH, this.secure),
    ]);
    response.redirect(HttpStatus.SEE_OTHER, `${this.coreHubWebUrl}/logout`);
  }

  private async verifyOrThrow(token: string): Promise<CoreHubTokenPayload> {
    try {
      return await this.verifier.verify(token);
    } catch (error) {
      const reason =
        error instanceof TokenVerificationError
          ? error.reason
          : TokenRejectionReason.MALFORMED_TOKEN;
      const kid = error instanceof TokenVerificationError ? error.kid : undefined;

      this.authEvents.jwtRejected({ reason, kid, path: '/auth/callback' });

      throw AppException.unauthorized('The Core Hub SSO token could not be verified');
    }
  }

  private remainingLifetimeSec(exp: number | undefined): number {
    if (typeof exp !== 'number') {
      return 0;
    }

    return Math.max(0, exp - Math.floor(Date.now() / 1000));
  }
}
