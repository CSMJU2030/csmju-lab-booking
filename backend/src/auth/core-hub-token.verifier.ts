import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeProtectedHeader, errors as joseErrors, jwtVerify } from 'jose';
import { CoreHubTokenPayload } from './core-hub-identity';
import { JwksService } from './jwks.service';
import { TokenRejectionReason, TokenVerificationError } from './auth.errors';

/** The Core Hub contract is immutable (spec §43). */
const REQUIRED_ALGORITHM = 'RS256';

/**
 * Verifies a Core Hub access token (spec §9, §13).
 *
 * 1. require alg = RS256   2. read kid           3. get public key from JWKS
 * 4. verify signature      5. verify iss          6. verify aud
 * 7. verify exp            8. reject anything else
 */
@Injectable()
export class CoreHubTokenVerifier {
  constructor(
    private readonly jwks: JwksService,
    private readonly config: ConfigService,
  ) {}

  async verify(token: string): Promise<CoreHubTokenPayload> {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new TokenVerificationError(TokenRejectionReason.MISSING_TOKEN, 'No token supplied');
    }

    // Step 1-2: inspect the (unverified) header only to learn alg and kid.
    let header: ReturnType<typeof decodeProtectedHeader>;
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw new TokenVerificationError(
        TokenRejectionReason.MALFORMED_TOKEN,
        'Token is not a well-formed JWT',
      );
    }

    // `alg: none`, HS256 and every other algorithm are rejected outright.
    if (header.alg !== REQUIRED_ALGORITHM) {
      throw new TokenVerificationError(
        TokenRejectionReason.UNSUPPORTED_ALGORITHM,
        `Unsupported token algorithm: ${String(header.alg)}`,
        header.kid,
      );
    }

    if (typeof header.kid !== 'string' || header.kid.length === 0) {
      throw new TokenVerificationError(
        TokenRejectionReason.MISSING_KID,
        'Token header does not contain a key id',
      );
    }

    // Step 3: resolve the public key for this kid (refreshing JWKS if needed).
    const key = await this.jwks.getKey(header.kid);

    // Step 4-7: signature + registered claim validation, enforcing RS256 again.
    let payload: CoreHubTokenPayload;
    try {
      const result = await jwtVerify(token, key, {
        algorithms: [REQUIRED_ALGORITHM],
        issuer: this.config.get<string>('coreHub.issuer', 'core-hub'),
        audience: this.config.get<string>('coreHub.audience', 'csmju2030'),
        clockTolerance: this.config.get<number>('coreHub.clockToleranceSec', 5),
      });
      payload = result.payload as unknown as CoreHubTokenPayload;
    } catch (error) {
      throw this.translate(error, header.kid);
    }

    // Step 8: the subsystem also requires a usable subject.
    if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      throw new TokenVerificationError(
        TokenRejectionReason.INVALID_CLAIMS,
        'Token has no subject claim',
        header.kid,
      );
    }

    return payload;
  }

  private translate(error: unknown, kid: string): TokenVerificationError {
    if (error instanceof TokenVerificationError) {
      return error;
    }

    if (error instanceof joseErrors.JWTExpired) {
      return new TokenVerificationError(TokenRejectionReason.EXPIRED, 'Token has expired', kid);
    }

    if (error instanceof joseErrors.JWTClaimValidationFailed) {
      if (error.claim === 'iss') {
        return new TokenVerificationError(
          TokenRejectionReason.INVALID_ISSUER,
          'Token issuer is not the Core Hub',
          kid,
        );
      }
      if (error.claim === 'aud') {
        return new TokenVerificationError(
          TokenRejectionReason.INVALID_AUDIENCE,
          'Token audience does not include this platform',
          kid,
        );
      }
      return new TokenVerificationError(
        TokenRejectionReason.INVALID_CLAIMS,
        `Token claim "${error.claim}" is invalid`,
        kid,
      );
    }

    if (
      error instanceof joseErrors.JOSEError &&
      error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'
    ) {
      return new TokenVerificationError(
        TokenRejectionReason.INVALID_SIGNATURE,
        'Token signature verification failed',
        kid,
      );
    }

    return new TokenVerificationError(
      TokenRejectionReason.MALFORMED_TOKEN,
      'Token could not be verified',
      kid,
    );
  }
}
