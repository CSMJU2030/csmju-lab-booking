import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { Request, Response } from 'express';
import { ErrorResponse } from '../api-response';
import { ErrorCode as Codes } from '../errors';

const STATUS_TO_CODE: Record<number, string> = {
  400: Codes.BAD_REQUEST,
  401: Codes.UNAUTHORIZED,
  403: Codes.FORBIDDEN,
  404: Codes.NOT_FOUND,
  409: Codes.CONFLICT,
  429: Codes.TOO_MANY_REQUESTS,
  503: Codes.SERVICE_UNAVAILABLE,
};

/**
 * Single place that turns any thrown error into the standard error envelope.
 * Internal details and stack traces stay in the server log (spec §27, §29).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.render(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Full detail server-side only - never in the HTTP response.
      this.logger.error(
        JSON.stringify({
          event: 'request.unhandled_error',
          method: request.method,
          // Path only: the query string can carry credentials, e.g. the
          // access_token Core Hub appends to /auth/callback.
          path: request.path,
          status,
        }),
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // Nothing left to render into once a response (e.g. a redirect) is out.
    if (response.headersSent) {
      return;
    }

    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      response.setHeader('Retry-After', '1');
    }

    response.status(status).json(body);
  }

  private render(exception: unknown): { status: number; body: ErrorResponse } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return { status, body: this.fromHttpException(status, payload) };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        error: { code: Codes.INTERNAL_ERROR, message: 'Internal server error' },
      },
    };
  }

  private fromHttpException(status: number, payload: unknown): ErrorResponse {
    const fallbackCode = STATUS_TO_CODE[status] ?? Codes.INTERNAL_ERROR;

    if (typeof payload === 'string') {
      return { success: false, error: { code: fallbackCode, message: payload } };
    }

    const record = (payload ?? {}) as Record<string, unknown>;
    const rawMessage = record.message;

    // class-validator produces `message: string[]`
    if (Array.isArray(rawMessage)) {
      return {
        success: false,
        error: {
          code: Codes.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: rawMessage,
        },
      };
    }

    return {
      success: false,
      error: {
        code: typeof record.code === 'string' ? record.code : fallbackCode,
        message:
          typeof rawMessage === 'string' && rawMessage.length > 0
            ? rawMessage
            : 'Request failed',
        ...(record.details !== undefined && record.details !== null
          ? { details: record.details }
          : {}),
      },
    };
  }

  private fromPrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): { status: number; body: ErrorResponse } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            success: false,
            error: {
              code: Codes.CONFLICT,
              message: 'A record with the same unique value already exists',
              details: (exception.meta as { target?: unknown } | undefined)?.target,
            },
          },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          body: {
            success: false,
            error: { code: Codes.BAD_REQUEST, message: 'Referenced record does not exist' },
          },
        };
      // Connection pool exhausted: a load problem, not a broken request. A 500
      // tells the caller "we are broken"; a 503 with Retry-After tells it to
      // come back, which is what an automatic retry should act on.
      case 'P2024':
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          body: {
            success: false,
            error: {
              code: Codes.SERVICE_UNAVAILABLE,
              message: 'Service is busy, please retry shortly',
            },
          },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: { success: false, error: { code: Codes.NOT_FOUND, message: 'Record not found' } },
        };
      default:
        this.logger.error(`Unhandled Prisma error ${exception.code}`);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: {
            success: false,
            error: { code: Codes.INTERNAL_ERROR, message: 'Internal server error' },
          },
        };
    }
  }
}
