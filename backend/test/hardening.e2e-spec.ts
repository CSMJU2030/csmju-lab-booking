/**
 * End-to-end coverage for the availability and input-handling hardening:
 *
 *   1. a malformed SSO cookie is rejected as 401, never rendered as 500;
 *   2. `?page=` is bounded, so no caller can ask for a trillion-row OFFSET;
 *   3. rate limiting runs in two layers - per address before authentication,
 *      per user after it - and answers 429 through the standard envelope
 *      (SSO spec D10, 6.12).
 *
 * It boots the real NestJS application with its global guards, validation pipe,
 * response interceptor and exception filter, against a fake Core Hub that
 * serves only a JWKS document and an in-memory stand-in for the database.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ssoCookieNames } from '../src/auth/sso-session';
import { MAX_PAGE } from '../src/common/dto/pagination.dto';
import { bootApp } from './helpers/boot-app';
import { FakeCoreHub } from './helpers/fake-core-hub';
import { InMemoryPrisma } from './helpers/in-memory-prisma';
import { TestSigningKey, createSigningKey, signCoreHubToken } from './helpers/token-factory';

const { session: SESSION } = ssoCookieNames('csmju-lab-booking');

/** The limits the subsystem ships with, which the rate-limit suites must pass on. */
const SHIPPED_LIMITS = {
  THROTTLE_IP_BURST_TTL_MS: '10000',
  THROTTLE_IP_BURST_LIMIT: '600',
  THROTTLE_IP_SUSTAINED_TTL_MS: '60000',
  THROTTLE_IP_SUSTAINED_LIMIT: '3000',
  THROTTLE_USER_BURST_TTL_MS: '10000',
  THROTTLE_USER_BURST_LIMIT: '100',
  THROTTLE_USER_SUSTAINED_TTL_MS: '60000',
  THROTTLE_USER_SUSTAINED_LIMIT: '600',
};

/** Sends `count` requests, `concurrency` at a time, and returns every status. */
async function fire(
  count: number,
  send: () => request.Test,
  concurrency = 50,
): Promise<request.Response[]> {
  const responses: request.Response[] = [];
  for (let sent = 0; sent < count; sent += concurrency) {
    const batch = Array.from({ length: Math.min(concurrency, count - sent) }, () => send());
    responses.push(...(await Promise.all(batch)));
  }
  return responses;
}

const statuses = (responses: request.Response[]) =>
  responses.reduce<Record<number, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

describe('Subsystem hardening (e2e)', () => {
  let coreHub: FakeCoreHub;
  let key: TestSigningKey;
  let staffToken: string;
  let studentToken: string;

  beforeAll(async () => {
    key = await createSigningKey('core-hub-2026');
    coreHub = new FakeCoreHub();
    await coreHub.start([key]);

    process.env.CORE_HUB_URL = coreHub.url;
    process.env.CORE_HUB_JWKS_URL = coreHub.jwksUrl;

    staffToken = await signCoreHubToken(key, {
      sub: 'user-003',
      email: 'staff@core.local',
      role: 'staff',
    });
    studentToken = await signCoreHubToken(key, {
      sub: 'user-002',
      email: 'student@core.local',
      role: 'student',
    });
  });

  afterAll(async () => {
    await coreHub.stop();
  });

  // -------------------------------------------------------------------------
  describe('malformed SSO cookie', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await bootApp(new InMemoryPrisma());
    });

    afterAll(async () => {
      await app.close();
    });

    it.each(['%', '%zz', 'valid%'])(
      'answers 401 rather than 500 for cookie value %s',
      async (value) => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/me')
          .set('Cookie', `${SESSION}=${value}`);

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          success: false,
          error: { code: 'UNAUTHORIZED' },
        });
      },
    );

    it('still accepts a valid Bearer token when a broken cookie is also present', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', `${SESSION}=%`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ subsystemRole: 'STAFF' });
    });
  });

  // -------------------------------------------------------------------------
  describe('pagination range', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await bootApp(new InMemoryPrisma());
    });

    afterAll(async () => {
      await app.close();
    });

    const bearer = () => ({ Authorization: `Bearer ${staffToken}` });

    it.each([MAX_PAGE + 1, 1_000_000_000_000])(
      'rejects page %s with 400 instead of running a huge OFFSET',
      async (page) => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/schedules?page=${page}&limit=100`)
          .set(bearer());

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          error: { code: 'VALIDATION_ERROR' },
        });
      },
    );

    it('still rejects an oversized limit', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/schedules?limit=101')
        .set(bearer());

      expect(response.status).toBe(400);
    });

    it('accepts the largest page still inside the range', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/schedules?page=${MAX_PAGE}&limit=100`)
        .set(bearer());

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: [],
        meta: { page: MAX_PAGE, limit: 100 },
      });
    });
  });

  // -------------------------------------------------------------------------
  // The rate-limit suites trust the loopback hop, so each test can play a
  // different client address through X-Forwarded-For and start from an empty
  // bucket - exactly how the dev server sees callers behind Cloudflare.
  describe('rate limiting with the shipped limits', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await bootApp(new InMemoryPrisma(), {
        ...SHIPPED_LIMITS,
        TRUST_PROXY: 'loopback, uniquelocal',
      });
    });

    afterAll(async () => {
      await app.close();
    });

    const from = (address: string) => (path: string) =>
      request(app.getHttpServer()).get(path).set('X-Forwarded-For', address);

    it('lets one address send 600 unauthenticated requests in 10 s, then answers 429', async () => {
      const lab = from('203.0.113.10');

      // A lab behind one NAT address: 500 requests with no token must all
      // reach authentication and come back 401 - none may be throttled.
      const first = await fire(500, () => lab('/api/v1/me'));
      expect(statuses(first)).toEqual({ 401: 500 });

      const upTo600 = await fire(100, () => lab('/api/v1/me'));
      expect(statuses(upTo600)).toEqual({ 401: 100 });

      const over = await lab('/api/v1/me');
      expect(over.status).toBe(429);
      expect(over.body).toMatchObject({ success: false, error: { code: 'TOO_MANY_REQUESTS' } });
      expect(Number(over.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(Number(over.headers['retry-after']))).toBe(true);

      // The health probe is never throttled, even from an exhausted address.
      const health = await fire(20, () => lab('/api/health'));
      expect(statuses(health)).toEqual({ 200: 20 });

      // Another address is untouched.
      expect((await from('203.0.113.11')('/api/v1/me')).status).toBe(401);
    });

    it('stops one user at 100 requests in 10 s while another user on the same address goes on', async () => {
      const office = from('203.0.113.20');
      const asStudent = () => office('/api/v1/me').set('Authorization', `Bearer ${studentToken}`);
      const asStaff = () => office('/api/v1/me').set('Authorization', `Bearer ${staffToken}`);

      const allowed = await fire(100, asStudent);
      expect(statuses(allowed)).toEqual({ 200: 100 });

      const over = await asStudent();
      expect(over.status).toBe(429);
      expect(over.body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(Number(over.headers['retry-after'])).toBeGreaterThanOrEqual(1);

      expect((await asStaff()).status).toBe(200);
    });

    it('counts a user across addresses: moving address does not reset the budget', async () => {
      const token = await signCoreHubToken(key, { sub: 'user-roaming', role: 'student' });
      const at = (address: string) =>
        from(address)('/api/v1/me').set('Authorization', `Bearer ${token}`);

      let n = 0;
      const spread = await fire(100, () => at(`198.51.100.${(n++ % 200) + 1}`));
      expect(statuses(spread)).toEqual({ 200: 100 });
      expect((await at('198.51.100.250')).status).toBe(429);
    });
  });

  // -------------------------------------------------------------------------
  describe('whose address is believed', () => {
    const tight = { THROTTLE_IP_BURST_LIMIT: '3', THROTTLE_IP_SUSTAINED_LIMIT: '3' };

    it('ignores X-Forwarded-For when TRUST_PROXY is unset, so a caller cannot pick its bucket', async () => {
      const app = await bootApp(new InMemoryPrisma(), { ...tight, TRUST_PROXY: '' });
      try {
        const send = (address: string) =>
          request(app.getHttpServer()).get('/api/v1/me').set('X-Forwarded-For', address);

        for (let i = 0; i < 3; i += 1) {
          expect((await send(`192.0.2.${i + 1}`)).status).toBe(401);
        }
        // A fresh forged address does not buy a fresh budget.
        expect((await send('192.0.2.99')).status).toBe(429);
      } finally {
        await app.close();
      }
    });

    it('believes it from an internal hop when TRUST_PROXY is loopback, uniquelocal', async () => {
      const app = await bootApp(new InMemoryPrisma(), {
        ...tight,
        TRUST_PROXY: 'loopback, uniquelocal',
      });
      try {
        const send = (address: string) =>
          request(app.getHttpServer()).get('/api/v1/me').set('X-Forwarded-For', address);

        for (let i = 0; i < 3; i += 1) {
          expect((await send('192.0.2.1')).status).toBe(401);
        }
        expect((await send('192.0.2.1')).status).toBe(429);
        expect((await send('192.0.2.2')).status).toBe(401);
      } finally {
        await app.close();
      }
    });

    it('takes the address the proxy appended, not one the caller put on the left', async () => {
      const app = await bootApp(new InMemoryPrisma(), {
        ...tight,
        TRUST_PROXY: 'loopback, uniquelocal',
      });
      try {
        // "<forged>, <real>": Cloudflare appends the real address on the right.
        const send = (forged: string) =>
          request(app.getHttpServer())
            .get('/api/v1/me')
            .set('X-Forwarded-For', `${forged}, 203.0.113.77`);

        for (let i = 0; i < 3; i += 1) {
          expect((await send(`10.9.9.${i}`)).status).toBe(401);
        }
        expect((await send('10.9.9.99')).status).toBe(429);
      } finally {
        await app.close();
      }
    });
  });
});
