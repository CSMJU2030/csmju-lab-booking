import { SUBSYSTEM_BLOCKED_NEXT, safeNextPath } from '../auth/next-path';

/**
 * All environment-specific values live here. Nothing in the application code
 * may hard-code a URL, issuer, audience or secret (spec §30, §41.15).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  /**
   * Value for Express's `trust proxy`, or false to leave it unset.
   *
   * Rate limiting keys callers on `request.ip`, which Express derives from
   * X-Forwarded-For only for hops this setting trusts. Unset means no proxy:
   * `request.ip` is the socket address and a forged header is ignored. On the
   * dev server use `loopback, uniquelocal` so Express skips the internal hops
   * and takes the public address Cloudflare appended on the right.
   */
  trustProxy: TrustProxy;
  subsystemId: string;
  subsystemName: string;
  /**
   * Connection pool and timeout ceilings. Prisma 7 talks to PostgreSQL through
   * a node-postgres driver adapter, so these are pool options rather than
   * DATABASE_URL query parameters.
   */
  database: {
    poolMax: number;
    connectTimeoutMs: number;
    idleTimeoutMs: number;
    statementTimeoutMs: number;
    idleInTransactionTimeoutMs: number;
  };
  coreHub: {
    url: string;
    /**
     * Core Hub's web app, where GET /auth/login sends the browser. It must be
     * the address the *browser* uses: this subsystem answers 302 and the
     * browser follows it, so a Docker-internal host name would not resolve.
     */
    webUrl: string;
    jwksUrl: string;
    issuer: string;
    audience: string;
    jwksCacheTtlMs: number;
    jwksMinRefreshIntervalMs: number;
    jwksRequestTimeoutMs: number;
    clockToleranceSec: number;
  };
  /** Central SSO round trip (auth-contract 5). */
  sso: {
    /** Lifetime of the state cookie: long enough to type a password. */
    stateTtlSec: number;
    /** Where the callback lands when there is no usable `next`. */
    postLoginRedirect: string;
  };
  /**
   * HTTP rate limiting in two layers (SSO spec D10). Each layer runs a short
   * window that absorbs bursts and a long one that caps sustained traffic.
   */
  throttle: {
    /** Per address, before the token is checked: loose, against floods. */
    ip: ThrottleWindows;
    /** Per verified user, after the token is checked. */
    user: ThrottleWindows;
  };
}

export type TrustProxy = false | number | string;

export interface ThrottleWindows {
  burstTtlMs: number;
  burstLimit: number;
  sustainedTtlMs: number;
  sustainedLimit: number;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * TRUST_PROXY: empty or `false` leaves `trust proxy` unset; a whole number is
 * a hop count; anything else goes to Express as written, e.g.
 * `loopback, uniquelocal`.
 */
export function parseTrustProxy(value: string | undefined): TrustProxy {
  const raw = value?.trim() ?? '';

  if (raw === '' || raw.toLowerCase() === 'false') {
    return false;
  }

  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    return hops === 0 ? false : hops;
  }

  return raw;
}

function windows(prefix: string, defaults: ThrottleWindows): ThrottleWindows {
  const env = process.env;
  return {
    burstTtlMs: num(env[`${prefix}_BURST_TTL_MS`], defaults.burstTtlMs),
    burstLimit: num(env[`${prefix}_BURST_LIMIT`], defaults.burstLimit),
    sustainedTtlMs: num(env[`${prefix}_SUSTAINED_TTL_MS`], defaults.sustainedTtlMs),
    sustainedLimit: num(env[`${prefix}_SUSTAINED_LIMIT`], defaults.sustainedLimit),
  };
}

export default (): AppConfig => {
  const coreHubUrl = process.env.CORE_HUB_URL ?? 'http://localhost:3000';

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: num(process.env.PORT, 3003),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    subsystemId: process.env.SUBSYSTEM_ID ?? 'csmju-lab-booking',
    subsystemName: process.env.SUBSYSTEM_NAME ?? 'CSMJU Lab Booking',
    database: {
      poolMax: num(process.env.DATABASE_POOL_MAX, 10),
      connectTimeoutMs: num(process.env.DATABASE_CONNECT_TIMEOUT_MS, 5000),
      idleTimeoutMs: num(process.env.DATABASE_IDLE_TIMEOUT_MS, 30_000),
      statementTimeoutMs: num(process.env.DATABASE_STATEMENT_TIMEOUT_MS, 5000),
      idleInTransactionTimeoutMs: num(process.env.DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS, 10_000),
    },
    coreHub: {
      url: coreHubUrl,
      webUrl: process.env.CORE_HUB_WEB_URL ?? 'http://localhost:3100',
      jwksUrl:
        process.env.CORE_HUB_JWKS_URL ??
        `${coreHubUrl.replace(/\/+$/, '')}/api/v1/.well-known/jwks.json`,
      issuer: process.env.CORE_HUB_ISSUER ?? 'core-hub',
      audience: process.env.CORE_HUB_AUDIENCE ?? 'csmju2030',
      jwksCacheTtlMs: num(process.env.JWKS_CACHE_TTL_MS, 10 * 60 * 1000),
      jwksMinRefreshIntervalMs: num(process.env.JWKS_MIN_REFRESH_INTERVAL_MS, 30 * 1000),
      jwksRequestTimeoutMs: num(process.env.JWKS_REQUEST_TIMEOUT_MS, 5000),
      clockToleranceSec: num(process.env.JWT_CLOCK_TOLERANCE_SEC, 5),
    },
    sso: {
      // auth-contract 5.2 caps the state cookie at 600 seconds.
      stateTtlSec: Math.min(num(process.env.SSO_STATE_TTL_SEC, 600), 600),
      postLoginRedirect:
        safeNextPath(process.env.SSO_POST_LOGIN_REDIRECT?.trim(), SUBSYSTEM_BLOCKED_NEXT) ??
        '/api/v1/me',
    },
    throttle: {
      // A lab of 50 people behind one NAT address opening a page together is
      // about 500 requests, so the per-address layer only stops real floods.
      ip: windows('THROTTLE_IP', {
        burstTtlMs: 10_000,
        burstLimit: 600,
        sustainedTtlMs: 60_000,
        sustainedLimit: 3000,
      }),
      // Ten requests a second for a whole minute is a script, not a person.
      user: windows('THROTTLE_USER', {
        burstTtlMs: 10_000,
        burstLimit: 100,
        sustainedTtlMs: 60_000,
        sustainedLimit: 600,
      }),
    },
  };
};
