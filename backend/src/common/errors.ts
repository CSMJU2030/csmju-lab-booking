import { HttpException, HttpStatus } from '@nestjs/common';

/** Machine-readable error codes used across the subsystem (spec §27). */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * HttpException carrying an explicit error code. The exception filter renders
 * it as `{ success: false, error: { code, message } }`.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCodeValue,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static badRequest(message: string, details?: unknown): AppException {
    return new AppException(ErrorCode.BAD_REQUEST, message, HttpStatus.BAD_REQUEST, details);
  }

  static unauthorized(message = 'Authentication is required'): AppException {
    return new AppException(ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(
    message = 'You do not have permission to perform this action',
  ): AppException {
    return new AppException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static notFound(message: string): AppException {
    return new AppException(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string, details?: unknown): AppException {
    return new AppException(ErrorCode.CONFLICT, message, HttpStatus.CONFLICT, details);
  }

  /** 429. The caller must also set `Retry-After` (whole seconds, at least 1). */
  static tooManyRequests(message: string): AppException {
    return new AppException(ErrorCode.TOO_MANY_REQUESTS, message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
