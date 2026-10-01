import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface CapturedResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function hostFor(): { host: ArgumentsHost; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: {}, headers: {} };

  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      captured.headers[name.toLowerCase()] = value;
    },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/api/v1/students', path: '/api/v1/students' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('AllExceptionsFilter · Prisma errors', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  // Regression: pool exhaustion is a load problem, not a broken request. As a
  // 500 it told callers "we are broken" and gave automatic retries nothing to
  // act on, so a burst kept being amplified.
  it('renders a saturated connection pool as 503 with Retry-After', () => {
    const { host, captured } = hostFor();

    filter.catch(prismaError('P2024'), host);

    expect(captured.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(captured.body).toMatchObject({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    expect(captured.headers['retry-after']).toBe('1');
  });

  it('maps a unique violation to 409', () => {
    const { host, captured } = hostFor();

    filter.catch(prismaError('P2002', { target: ['student_code'] }), host);

    expect(captured.status).toBe(HttpStatus.CONFLICT);
    expect(captured.body).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('maps a missing foreign key to 400 and a missing record to 404', () => {
    const fk = hostFor();
    filter.catch(prismaError('P2003'), fk.host);
    expect(fk.captured.status).toBe(HttpStatus.BAD_REQUEST);

    const missing = hostFor();
    filter.catch(prismaError('P2025'), missing.host);
    expect(missing.captured.status).toBe(HttpStatus.NOT_FOUND);
  });

  it('keeps an unrecognised Prisma error as an opaque 500', () => {
    const { host, captured } = hostFor();

    filter.catch(prismaError('P9999'), host);

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(captured.headers['retry-after']).toBeUndefined();
  });

  it('never leaks an unexpected error to the caller', () => {
    const { host, captured } = hostFor();

    // A marker stands in for whatever internal detail a real error carries
    // (a connection string, a file path, a query). Its only job is to be
    // unmistakable in the body if it ever leaks.
    const leakyError = new Error('pool detail LEAK-MARKER-7F3A');

    filter.catch(leakyError, host);

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(captured.body)).not.toContain('LEAK-MARKER-7F3A');
  });
});

describe('AllExceptionsFilter · logging', () => {
  afterEach(() => jest.restoreAllMocks());

  // Regression: the query string of /auth/callback carries the Core Hub
  // access_token, and a 500 there used to write it to the server log.
  it('logs the request path without its query string', () => {
    const filter = new AllExceptionsFilter();
    const error = jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    const response = { status: () => response, json: () => response, setHeader: () => undefined };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          method: 'GET',
          url: '/auth/callback?access_token=eyJ.secret.sig&state=s',
          path: '/auth/callback',
        }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new Error('boom'), host);

    const logged = String(error.mock.calls[0][0]);
    expect(logged).toContain('"path":"/auth/callback"');
    expect(logged).not.toContain('access_token');
  });

  it('does not write a body once the response has already been sent', () => {
    const filter = new AllExceptionsFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    const json = jest.fn();
    const response = { headersSent: true, status: () => ({ json }), json, setHeader: jest.fn() };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'GET', url: '/auth/callback', path: '/auth/callback' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new Error('late'), host);

    expect(json).not.toHaveBeenCalled();
  });
});
