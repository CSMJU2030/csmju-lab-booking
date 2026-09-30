/** Why a Core Hub token was rejected. Logged; never returned verbatim in detail. */
export enum TokenRejectionReason {
  MISSING_TOKEN = 'missing_token',
  MALFORMED_TOKEN = 'malformed_token',
  UNSUPPORTED_ALGORITHM = 'unsupported_algorithm',
  MISSING_KID = 'missing_kid',
  UNKNOWN_KID = 'unknown_kid',
  JWKS_UNAVAILABLE = 'jwks_unavailable',
  INVALID_SIGNATURE = 'invalid_signature',
  EXPIRED = 'expired',
  INVALID_ISSUER = 'invalid_issuer',
  INVALID_AUDIENCE = 'invalid_audience',
  INVALID_CLAIMS = 'invalid_claims',
  /**
   * A callback without `state`: Core Hub started this sign-in (a sidebar
   * click), so the token is dropped and the browser restarts at /auth/login.
   */
  SSO_RESTART_WITHOUT_STATE = 'sso_restart_without_state',
  /** A callback with `state` but no state cookie: this browser never started it. */
  SSO_STATE_MISSING = 'sso_state_missing',
  /** A callback whose `state` differs from the cookie: someone else's sign-in. */
  SSO_STATE_MISMATCH = 'sso_state_mismatch',
}

/** Raised by the JWKS/verification layer. Turned into HTTP 401 by the guard. */
export class TokenVerificationError extends Error {
  constructor(
    readonly reason: TokenRejectionReason,
    message: string,
    readonly kid?: string,
  ) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}
