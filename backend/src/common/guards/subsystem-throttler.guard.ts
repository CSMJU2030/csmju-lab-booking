import {
  CanActivate,
  ExecutionContext,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { CoreHubIdentity } from '../../auth/core-hub-identity';
import type { ThrottleWindows } from '../../config/configuration';
import { AppException } from '../errors';

/**
 * HTTP rate limiting for the whole subsystem, in two layers (SSO spec D10):
 *
 *   IpThrottlerGuard -> CoreHubJwtGuard -> UserThrottlerGuard -> PermissionsGuard
 *
 * The per-address layer runs first, so a flood is turned away before any RSA
 * signature check, JWKS lookup or database connection is spent on it. It is
 * deliberately loose: a whole lab behind one NAT address shares it. The
 * per-user layer runs once the token is verified and keys on `sub`, which is
 * the only fair count when many people share an address.
 *
 * Why this is hand written instead of @nestjs/throttler
 * -----------------------------------------------------
 * Rule ARC-02/03 of csmju2030-standards checks package.json against an allow
 * list (scripts/lib/allowed-deps.json), and @nestjs/throttler is not on it.
 * express-rate-limit is out too: express itself sits in forbidden_everywhere.
 * Core Hub hit the same wall and solved it the same way.
 *
 * Accepted limits
 * ---------------
 * Counters live in this process, so they reset on restart and each instance
 * counts on its own. Neither matters while the subsystem runs as one process;
 * a multi-instance deployment would need a shared store such as Redis.
 */

/** Monitoring probes poll on a fixed interval and must never be rate limited. */
const UNTHROTTLED_PATHS = new Set<string>(['/api/health']);

const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests. Please slow down and retry shortly.';

/** How often expired buckets are dropped, so the map cannot grow without bound. */
const SWEEP_INTERVAL_MS = 60_000;

interface Window {
  name: 'burst' | 'sustained';
  limit: number;
  ttlMs: number;
}

interface Bucket {
  ttlMs: number;
  /** Arrival times inside the window, oldest first. */
  times: number[];
}

function windowsOf(config: ThrottleWindows): Window[] {
  return [
    { name: 'burst', limit: config.burstLimit, ttlMs: config.burstTtlMs },
    { name: 'sustained', limit: config.sustainedLimit, ttlMs: config.sustainedTtlMs },
  ];
}

/**
 * The counters both layers share, and the timer that prunes them. One bucket
 * per caller per window, shared across every route: keying on the route too
 * would give each endpoint its own budget, and a flood would only have to
 * rotate endpoints to multiply its allowance.
 */
@Injectable()
export class ThrottleStore implements OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();

  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Never hold the process open at shutdown just for the sweep timer.
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
    this.buckets.clear();
  }

  /**
   * Counts one request against every window, or refuses it.
   *
   * Every window has to have room. They are charged only once none is full,
   * so a request the burst window refuses does not also eat the sustained
   * allowance. Returns the seconds to wait when refused, else null.
   */
  consume(key: string, windows: Window[]): number | null {
    const now = Date.now();
    const waits = windows
      .map((window) => this.retryAfterFor(`${key}:${window.name}`, window, now))
      .filter((wait): wait is number => wait !== null);

    if (waits.length > 0) {
      return Math.max(...waits);
    }

    for (const window of windows) {
      this.bucketFor(`${key}:${window.name}`, window, now).times.push(now);
    }

    return null;
  }

  private retryAfterFor(key: string, window: Window, now: number): number | null {
    const bucket = this.bucketFor(key, window, now);

    if (bucket.times.length < window.limit) {
      return null;
    }

    // The oldest arrival is the one whose expiry frees a slot.
    return Math.max(1, Math.ceil((bucket.times[0] + window.ttlMs - now) / 1000));
  }

  private bucketFor(key: string, window: Window, now: number): Bucket {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { ttlMs: window.ttlMs, times: [] };
      this.buckets.set(key, bucket);
    } else {
      bucket.ttlMs = window.ttlMs;
    }

    const cutoff = now - window.ttlMs;
    let stale = 0;
    while (stale < bucket.times.length && bucket.times[stale] <= cutoff) {
      stale += 1;
    }
    if (stale > 0) {
      bucket.times.splice(0, stale);
    }

    return bucket;
  }

  /** Drops buckets whose last arrival has aged out of their own window. */
  private sweep(): void {
    const now = Date.now();

    for (const [key, bucket] of this.buckets) {
      const last = bucket.times[bucket.times.length - 1];
      if (last === undefined || now - last > bucket.ttlMs) {
        this.buckets.delete(key);
      }
    }
  }
}

/** What both layers do; they differ only in whose count a request is. */
abstract class LayeredThrottler implements CanActivate {
  protected abstract readonly layer: 'ip' | 'user';

  private windowsCache?: Window[];

  constructor(
    private readonly store: ThrottleStore,
    private readonly config: ConfigService,
  ) {}

  /** The caller this request counts against, or null to let it through uncounted. */
  protected abstract trackerFor(request: Request): string | null;

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    if (UNTHROTTLED_PATHS.has(request.path)) {
      return true;
    }

    const tracker = this.trackerFor(request);
    if (tracker === null) {
      return true;
    }

    const retryAfterSec = this.store.consume(tracker, this.windows());
    if (retryAfterSec === null) {
      return true;
    }

    http.getResponse<Response>().setHeader('Retry-After', String(retryAfterSec));
    throw AppException.tooManyRequests(TOO_MANY_REQUESTS_MESSAGE);
  }

  private windows(): Window[] {
    this.windowsCache ??= windowsOf(
      this.config.get<ThrottleWindows>(`throttle.${this.layer}`) as ThrottleWindows,
    );
    return this.windowsCache;
  }
}

/**
 * Layer 1: per address, before the token is checked.
 *
 * `request.ip` honours X-Forwarded-For only for the hops TRUST_PROXY trusts
 * (see main.ts). The header is never read here directly: a caller could put
 * any address in it and choose its own bucket.
 */
@Injectable()
export class IpThrottlerGuard extends LayeredThrottler {
  protected readonly layer = 'ip';

  constructor(store: ThrottleStore, config: ConfigService) {
    super(store, config);
  }

  protected trackerFor(request: Request): string {
    const ip = typeof request.ip === 'string' && request.ip.length > 0 ? request.ip : 'unknown';
    return `ip:${ip}`;
  }
}

/**
 * Layer 2: per verified user, after CoreHubJwtGuard. A public endpoint has no
 * `request.user` and is left to layer 1.
 */
@Injectable()
export class UserThrottlerGuard extends LayeredThrottler {
  protected readonly layer = 'user';

  constructor(store: ThrottleStore, config: ConfigService) {
    super(store, config);
  }

  protected trackerFor(request: Request): string | null {
    const user = (request as Request & { user?: CoreHubIdentity }).user;
    return user?.id ? `user:${user.id}` : null;
  }
}
