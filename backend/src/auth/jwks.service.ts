import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JWK, KeyLike, importJWK } from "jose";
import { AuthEventsLogger } from "./auth-events.logger";
import { TokenRejectionReason, TokenVerificationError } from "./auth.errors";

interface CachedKey {
  jwk: JWK;
  imported?: KeyLike | Uint8Array;
}

/**
 * Core Hub JWKS client (spec §10, §11, §40).
 *
 * - Downloads public keys from the Core Hub JWKS endpoint (public material only).
 * - Caches keys with a TTL so the Core Hub is not contacted per request.
 * - Selects the key by the JWT header `kid` - never assumes a single permanent key.
 * - On an unknown `kid`, refreshes ONCE (rate limited) before rejecting, which
 *   makes Core Hub key rotation transparent without allowing refresh loops.
 */
@Injectable()
export class JwksService {
  private cache = new Map<string, CachedKey>();
  private fetchedAt = 0;
  private lastRefreshAttemptAt = 0;
  private lastFailureAt = 0;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly authEvents: AuthEventsLogger,
  ) {}

  private get jwksUrl(): string {
    return this.config.get<string>(
      "coreHub.jwksUrl",
      "http://localhost:3000/api/v1/.well-known/jwks.json",
    );
  }

  private get cacheTtlMs(): number {
    return this.config.get<number>("coreHub.jwksCacheTtlMs", 600_000);
  }

  private get minRefreshIntervalMs(): number {
    return this.config.get<number>("coreHub.jwksMinRefreshIntervalMs", 30_000);
  }

  private get requestTimeoutMs(): number {
    return this.config.get<number>("coreHub.jwksRequestTimeoutMs", 5_000);
  }

  /** Currently cached key ids (diagnostics / logging only). */
  knownKids(): string[] {
    return [...this.cache.keys()];
  }

  /** Drops the cache. Used by tests and by administrative tooling. */
  reset(): void {
    this.cache.clear();
    this.fetchedAt = 0;
    this.lastRefreshAttemptAt = 0;
    this.lastFailureAt = 0;
  }

  private isFresh(now: number): boolean {
    return this.cache.size > 0 && now - this.fetchedAt < this.cacheTtlMs;
  }

  /**
   * True while a failed refresh is still cooling down.
   *
   * A failure does not move `fetchedAt`, so the cache stays permanently stale
   * for as long as the Core Hub is away. Without this backoff every inbound
   * request would start its own outbound fetch and block for the whole request
   * timeout, taking the subsystem down with the Core Hub even though the
   * cached keys are perfectly usable.
   */
  private inFailureBackoff(now: number): boolean {
    return this.lastFailureAt > 0 && now - this.lastFailureAt < this.minRefreshIntervalMs;
  }

  /**
   * Resolves the public key for `kid`.
   *
   * Flow: cached key -> (stale ? refresh) -> (missing kid ? refresh once) -> reject.
   */
  async getKey(kid: string): Promise<KeyLike | Uint8Array> {
    if (!kid) {
      throw new TokenVerificationError(
        TokenRejectionReason.MISSING_KID,
        "Token header does not contain a key id",
      );
    }

    const now = Date.now();

    if (this.isFresh(now) && this.cache.has(kid)) {
      return this.importKey(kid);
    }

    // Stale or empty cache: refresh, unless a refresh just failed.
    if (!this.isFresh(now) && !this.inFailureBackoff(now)) {
      await this.refresh("cache_stale_or_empty");
      if (this.cache.has(kid)) {
        return this.importKey(kid);
      }
    }

    // A stale key still has to satisfy the signature check, so serving one
    // keeps the subsystem available through a Core Hub outage without weakening
    // verification.
    if (this.cache.has(kid)) {
      return this.importKey(kid);
    }

    // Unknown kid: Core Hub may have rotated. Refresh at most once more,
    // rate limited => no refresh loop.
    if (this.canAttemptRefresh(Date.now()) && !this.inFailureBackoff(Date.now())) {
      await this.refresh("unknown_kid");
    }

    if (this.cache.has(kid)) {
      return this.importKey(kid);
    }

    // Nothing was ever cached and the Core Hub is unreachable: the honest
    // answer is "keys unavailable", not "unknown key id".
    if (this.cache.size === 0) {
      throw new TokenVerificationError(
        TokenRejectionReason.JWKS_UNAVAILABLE,
        "Core Hub public keys are currently unavailable",
      );
    }

    this.authEvents.unknownKid({ kid, knownKids: this.knownKids() });
    throw new TokenVerificationError(
      TokenRejectionReason.UNKNOWN_KID,
      "Token was signed with an unknown key id",
      kid,
    );
  }

  private canAttemptRefresh(now: number): boolean {
    return now - this.lastRefreshAttemptAt >= this.minRefreshIntervalMs;
  }

  /** Fetches the JWKS document. Concurrent callers share one HTTP request. */
  async refresh(reason: string): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }

    this.lastRefreshAttemptAt = Date.now();
    this.inFlight = this.doRefresh(reason).finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async doRefresh(reason: string): Promise<void> {
    const url = this.jwksUrl;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`JWKS endpoint responded with HTTP ${response.status}`);
      }

      // RFC 7517 JWK Set: the document MUST be `{ "keys": [ ... ] }` at the top
      // level. Anything else (for example a response wrapped in an API
      // envelope) is refused - the Core Hub JWKS endpoint is a public
      // interoperability contract that every standard client relies on.
      const body = (await response.json()) as {
        keys?: unknown;
        data?: { keys?: unknown };
      };

      if (!Array.isArray(body.keys)) {
        if (Array.isArray(body.data?.keys)) {
          throw new Error(
            'Core Hub JWKS must be an RFC 7517 document ({"keys":[...]}), but the ' +
              'response was wrapped in an API envelope ({"data":{"keys":[...]}}). ' +
              "Upgrade the Core Hub to a version that excludes the JWKS endpoint " +
              "from its response interceptor.",
          );
        }

        throw new Error('JWKS response has no top-level "keys" array (RFC 7517)');
      }

      const keys = body.keys as JWK[];

      const next = new Map<string, CachedKey>();
      for (const jwk of keys) {
        if (!this.isUsableSigningKey(jwk)) {
          continue;
        }
        next.set(jwk.kid as string, { jwk });
      }

      if (next.size === 0) {
        throw new Error("JWKS response contains no usable RS256 signing key");
      }

      this.cache = next;
      this.fetchedAt = Date.now();
      this.lastFailureAt = 0;
      this.authEvents.jwksRefresh({
        url,
        reason,
        keyCount: next.size,
        kids: [...next.keys()],
      });
    } catch (error) {
      this.lastFailureAt = Date.now();
      this.authEvents.jwksRefreshFailed({
        reason: error instanceof Error ? error.message : "unknown error",
        cachedKeyCount: this.cache.size,
      });

      // Keep serving from a previously good cache when the Core Hub is briefly
      // unreachable; only fail hard when nothing is cached at all.
      if (this.cache.size === 0) {
        throw new TokenVerificationError(
          TokenRejectionReason.JWKS_UNAVAILABLE,
          "Core Hub public keys are currently unavailable",
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Only RSA signature keys usable for the fixed RS256 contract are cached. */
  private isUsableSigningKey(jwk: JWK | undefined): boolean {
    if (!jwk || typeof jwk.kid !== "string" || jwk.kid.length === 0) {
      return false;
    }
    if (jwk.kty !== "RSA") {
      return false;
    }
    if (jwk.use !== undefined && jwk.use !== "sig") {
      return false;
    }
    if (jwk.alg !== undefined && jwk.alg !== "RS256") {
      return false;
    }
    // A public JWKS must never carry private key material.
    if (jwk.d !== undefined) {
      return false;
    }
    return true;
  }

  private async importKey(kid: string): Promise<KeyLike | Uint8Array> {
    const entry = this.cache.get(kid) as CachedKey;
    if (!entry.imported) {
      entry.imported = await importJWK(entry.jwk, "RS256");
    }
    return entry.imported;
  }
}
