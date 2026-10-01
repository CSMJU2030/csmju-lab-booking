/**
 * Central SSO - subsystem side (e2e), auth-contract 5 / SSO spec 6.12.
 *
 *   GET  /auth/login     mints a state, keeps it in a cookie, sends the browser
 *                        to Core Hub's web app
 *   GET  /auth/callback  Core Hub comes back here with a token
 *   POST /auth/logout    clears this subsystem's cookies, goes to Core Hub /logout
 *
 * The subsystem keeps no session of its own: the verified Core Hub token *is*
 * the session cookie. Runs against a fake Core Hub that serves only a JWKS
 * document and an in-memory database double - no PostgreSQL required.
 */
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ssoCookieNames } from '../src/auth/sso-session';
import { bootApp } from './helpers/boot-app';
import { FakeCoreHub } from './helpers/fake-core-hub';
import { InMemoryPrisma } from './helpers/in-memory-prisma';
import {
  TestSigningKey,
  createAlgNoneToken,
  createSigningKey,
  signCoreHubToken,
  signHs256Token,
  tamperPayload,
} from './helpers/token-factory';

const CORE_HUB_WEB_URL = 'http://hub-web.test';
const { session: SESSION, state: STATE } = ssoCookieNames('csmju-lab-booking');
const backslash = String.fromCharCode(92);

type Res = request.Response;

const setCookies = (response: Res): string[] => {
  const raw = response.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw as unknown as string] : [];
};

/** The Set-Cookie for one cookie name, or undefined. */
const cookieFor = (response: Res, name: string): string | undefined =>
  setCookies(response).find((entry) => entry.startsWith(`${name}=`));

/** A Set-Cookie that sets a value (as opposed to one that deletes it). */
const setsValue = (entry: string | undefined): boolean =>
  !!entry && !entry.startsWith(`${entry.split('=')[0]}=;`) && !/Max-Age=0\b/.test(entry);

const deletes = (entry: string | undefined, path: string): boolean =>
  !!entry && /Max-Age=0\b/.test(entry) && entry.includes(`Path=${path}`);

const pair = (entry: string | undefined): string => (entry ?? '').split(';')[0];

const expOf = (token: string): number =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).exp as number;

describe('Central SSO (e2e)', () => {
  let app: NestExpressApplication;
  let coreHub: FakeCoreHub;
  let key: TestSigningKey;

  let studentToken: string;
  let staffToken: string;

  const http = () => request(app.getHttpServer());

  /** Starts a sign-in the way a browser does and returns what it would keep. */
  async function startLogin(next?: string): Promise<{ state: string; cookie: string; res: Res }> {
    const res = await http()
      .get('/auth/login')
      .query(next === undefined ? {} : { next })
      .expect(302);
    const state = new URL(res.headers.location).searchParams.get('state') ?? '';
    return { state, cookie: pair(cookieFor(res, STATE)), res };
  }

  /** Completes a sign-in with `token` and returns the callback response. */
  async function finishLogin(token: string, next?: string): Promise<Res> {
    const { state, cookie } = await startLogin(next);
    return http().get('/auth/callback').query({ access_token: token, state }).set('Cookie', cookie);
  }

  beforeAll(async () => {
    key = await createSigningKey('core-hub-2026');
    coreHub = new FakeCoreHub();
    await coreHub.start([key]);

    process.env.CORE_HUB_URL = coreHub.url;
    process.env.CORE_HUB_JWKS_URL = coreHub.jwksUrl;

    studentToken = await signCoreHubToken(key, {
      sub: 'user-002',
      email: 'student@core.local',
      role: 'student',
    });
    staffToken = await signCoreHubToken(key, {
      sub: 'user-003',
      email: 'staff@core.local',
      role: 'staff',
    });

    app = await bootApp(new InMemoryPrisma());
  });

  afterAll(async () => {
    await app.close();
    await coreHub.stop();
  });

  // ------------------------------------------------------------ /auth/login --
  describe('GET /auth/login', () => {
    it('sends the browser to Core Hub web /sso/authorize with subsystem and state', async () => {
      const { res, state } = await startLogin();
      const target = new URL(res.headers.location);

      expect(`${target.origin}${target.pathname}`).toBe(`${CORE_HUB_WEB_URL}/sso/authorize`);
      expect(target.searchParams.get('subsystem')).toBe('csmju-lab-booking');
      expect(state).toMatch(/^[A-Za-z0-9_-]{43,}$/);
      // Core Hub uses the registered callback; sending one would be refused.
      expect(target.searchParams.has('callback_url')).toBe(false);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('keeps the state in an HttpOnly cookie only the callback receives, for 600 s', async () => {
      const { res, state } = await startLogin('/courses');
      const cookie = cookieFor(res, STATE) ?? '';

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/auth/callback');
      expect(cookie).toContain('Max-Age=600');
      expect(decodeURIComponent(pair(cookie).split('=')[1]).startsWith(`${state}.`)).toBe(true);
    });

    it('mints a new state every time', async () => {
      const first = await startLogin();
      const second = await startLogin();
      expect(first.state).not.toBe(second.state);
    });

    it.each([
      '//evil.example.com',
      `/${backslash}evil.example.com`,
      'https://evil.example.com',
      '/auth/login',
    ])('replaces the unsafe next %s with the default landing', async (next) => {
      const res = await finishLogin(studentToken, next);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/api/v1/me');
    });

    it('is not placed under /api', async () => {
      await http().get('/api/auth/login').expect(404);
    });
  });

  // --------------------------------------------------------- /auth/callback --
  describe('GET /auth/callback', () => {
    it('answers 400 when access_token is missing', async () => {
      const { state, cookie } = await startLogin();
      await http().get('/auth/callback').query({ state }).set('Cookie', cookie).expect(400);
    });

    describe('without state (a Core Hub sidebar click)', () => {
      it('drops the token and restarts at /auth/login without any cookie', async () => {
        const { cookie } = await startLogin();
        const res = await http()
          .get('/auth/callback')
          .query({ access_token: studentToken, token_type: 'Bearer', expires_in: '900' })
          .set('Cookie', cookie)
          .expect(302);

        expect(res.headers.location).toBe('/auth/login');
        expect(cookieFor(res, SESSION)).toBeUndefined();
        // Another tab may be mid-sign-in: its state cookie is left alone.
        expect(cookieFor(res, STATE)).toBeUndefined();
      });

      it("never signs a victim in with an attacker's token", async () => {
        const attacker = await signCoreHubToken(key, { sub: 'attacker', role: 'staff' });
        const res = await http().get('/auth/callback').query({ access_token: attacker });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/auth/login');
        expect(setsValue(cookieFor(res, SESSION))).toBe(false);
      });
    });

    it('answers 401 for a state with no state cookie, setting no session', async () => {
      const { state } = await startLogin();
      const res = await http()
        .get('/auth/callback')
        .query({ access_token: studentToken, state })
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(setsValue(cookieFor(res, SESSION))).toBe(false);
      // A failed callback must not redirect again: that is how loops start.
      expect(res.headers.location).toBeUndefined();
    });

    it('answers 401 for a state that is not the cookie, and burns the cookie', async () => {
      const mine = await startLogin();
      const theirs = await startLogin();

      const res = await http()
        .get('/auth/callback')
        .query({ access_token: studentToken, state: theirs.state })
        .set('Cookie', mine.cookie)
        .expect(401);

      expect(setsValue(cookieFor(res, SESSION))).toBe(false);
      expect(deletes(cookieFor(res, STATE), '/auth/callback')).toBe(true);
    });

    it('answers 401 for an empty state', async () => {
      const { cookie } = await startLogin();
      await http()
        .get('/auth/callback')
        .query({ access_token: studentToken, state: '' })
        .set('Cookie', cookie)
        .expect(401);
    });

    describe('with a matching state but a token that must not pass', () => {
      const bad: Array<[string, () => Promise<string>]> = [
        ['garbage', async () => 'not-a-jwt'],
        ['a tampered payload', async () => tamperPayload(studentToken, { role: 'admin' })],
        ['alg none', async () => createAlgNoneToken('admin')],
        ['HS256', async () => signHs256Token()],
        ['an expired token', async () => signCoreHubToken(key, { expiresInSec: -60 })],
        ['a wrong issuer', async () => signCoreHubToken(key, { issuer: 'evil-hub' })],
        ['a wrong audience', async () => signCoreHubToken(key, { audience: 'other' })],
        ['an unknown key', async () => signCoreHubToken(await createSigningKey('rogue'))],
      ];

      it.each(bad)('answers 401 for %s, sets no session and burns the state', async (_, make) => {
        const res = await finishLogin(await make());

        expect(res.status).toBe(401);
        expect(setsValue(cookieFor(res, SESSION))).toBe(false);
        expect(deletes(cookieFor(res, STATE), '/auth/callback')).toBe(true);
      });
    });

    it('answers 403 for a role this subsystem does not map, setting no session', async () => {
      const res = await finishLogin(await signCoreHubToken(key, { role: 'finance-officer' }));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(setsValue(cookieFor(res, SESSION))).toBe(false);
    });

    it('turns the token into a session cookie and returns to the stored next', async () => {
      const res = await finishLogin(studentToken, '/courses?term=1');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/courses?term=1');

      const session = cookieFor(res, SESSION) ?? '';
      expect(pair(session)).toBe(`${SESSION}=${encodeURIComponent(studentToken)}`);
      expect(session).toContain('HttpOnly');
      expect(session).toContain('SameSite=Lax');
      expect(session).toContain('Path=/;');

      const maxAge = Number(/Max-Age=(\d+)/.exec(session)?.[1]);
      const expected = expOf(studentToken) - Math.floor(Date.now() / 1000);
      expect(Math.abs(maxAge - expected)).toBeLessThanOrEqual(2);

      expect(deletes(cookieFor(res, STATE), '/auth/callback')).toBe(true);
    });

    it('lands on the default page when no next was given', async () => {
      const res = await finishLogin(studentToken);
      expect(res.headers.location).toBe('/api/v1/me');
    });

    it('marks every outcome no-store and no-referrer', async () => {
      const outcomes = [
        await finishLogin(studentToken),
        await finishLogin('not-a-jwt'),
        await http().get('/auth/callback').query({ access_token: studentToken }),
      ];

      for (const res of outcomes) {
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['referrer-policy']).toBe('no-referrer');
      }
    });

    it('accepts a state only once', async () => {
      const { state, cookie } = await startLogin();
      await http()
        .get('/auth/callback')
        .query({ access_token: studentToken, state })
        .set('Cookie', cookie)
        .expect(302);

      // The browser deleted the cookie; a replay without it is refused.
      await http().get('/auth/callback').query({ access_token: studentToken, state }).expect(401);
    });

    it('never writes the token or the full callback URL to the log', async () => {
      const lines: string[] = [];
      const spies = (['log', 'warn', 'error'] as const).map((level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
          lines.push(args.map(String).join(' '));
        }),
      );

      try {
        await finishLogin(studentToken);
        await finishLogin(tamperPayload(studentToken, { role: 'admin' }));
        await http().get('/auth/callback').query({ access_token: studentToken });
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }

      const log = lines.join('\n');
      expect(log).toContain('sso_restart_without_state');
      expect(log).not.toContain(studentToken.split('.')[2]);
      expect(log).not.toContain('access_token');
    });

    it('is served at the registered root path, not under /api', async () => {
      await http().get('/api/auth/callback').query({ access_token: studentToken }).expect(404);
    });
  });

  // ------------------------------------------------------------ the session --
  describe('the session cookie', () => {
    it('alone is enough for /api/v1/me, which reports when it expires', async () => {
      const res = await http()
        .get('/api/v1/me')
        .set('Cookie', `${SESSION}=${encodeURIComponent(studentToken)}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: 'user-002',
        coreRole: 'student',
        subsystemRole: 'STUDENT',
      });
      expect(res.body.data.session.expiresAt).toBe(
        new Date(expOf(studentToken) * 1000).toISOString(),
      );
    });

    it('loses to a Bearer header when both are sent', async () => {
      const res = await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${staffToken}`)
        .set('Cookie', `${SESSION}=${encodeURIComponent(studentToken)}`)
        .expect(200);

      expect(res.body.data.id).toBe('user-003');
    });

    it('is ignored under another subsystem name', async () => {
      await http()
        .get('/api/v1/me')
        .set('Cookie', `equipment_service_access_token=${encodeURIComponent(studentToken)}`)
        .expect(401);
    });

    it('answers an expired session with 401 JSON, never a redirect to sign in', async () => {
      const expired = await signCoreHubToken(key, { role: 'student', expiresInSec: -60 });
      const res = await http()
        .get('/api/v1/me')
        .set('Cookie', `${SESSION}=${encodeURIComponent(expired)}`)
        .expect(401);

      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers.location).toBeUndefined();
      expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    });

    it('answers no credentials at all with 401 JSON too', async () => {
      const res = await http().get('/api/v1/schedules').expect(401);
      expect(res.headers.location).toBeUndefined();
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ----------------------------------------------------------- /auth/logout --
  describe('POST /auth/logout', () => {
    it('clears both cookies on their own paths and goes to Core Hub /logout', async () => {
      const res = await http()
        .post('/auth/logout')
        .set('Cookie', `${SESSION}=${encodeURIComponent(studentToken)}`)
        .expect(303);

      expect(res.headers.location).toBe(`${CORE_HUB_WEB_URL}/logout`);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(deletes(cookieFor(res, SESSION), '/')).toBe(true);
      expect(deletes(cookieFor(res, STATE), '/auth/callback')).toBe(true);
    });

    it('works without any session', async () => {
      await http().post('/auth/logout').expect(303);
    });

    it('is not a GET, so a link or an <img> cannot sign anyone out', async () => {
      await http().get('/auth/logout').expect(404);
    });
  });
});
