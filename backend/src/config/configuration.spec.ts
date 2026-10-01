import configuration, { parseTrustProxy } from './configuration';

/**
 * These values decide how strictly the subsystem throttles traffic, whose
 * address it believes and where it sends a browser, so the parsing is covered
 * directly.
 */
describe('configuration', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  describe('trustProxy', () => {
    it.each([undefined, '', '   ', 'false', 'FALSE', '0'])(
      'leaves trust proxy unset for %p, so X-Forwarded-For is ignored',
      (value) => {
        expect(parseTrustProxy(value)).toBe(false);
      },
    );

    it('reads a whole number as a hop count', () => {
      expect(parseTrustProxy('1')).toBe(1);
      expect(parseTrustProxy(' 2 ')).toBe(2);
    });

    it('passes anything else to Express as written', () => {
      expect(parseTrustProxy('loopback, uniquelocal')).toBe('loopback, uniquelocal');
      expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
    });

    it('is read from TRUST_PROXY', () => {
      delete process.env.TRUST_PROXY;
      expect(configuration().trustProxy).toBe(false);

      process.env.TRUST_PROXY = 'loopback, uniquelocal';
      expect(configuration().trustProxy).toBe('loopback, uniquelocal');
    });
  });

  describe('throttle', () => {
    const keys = ['IP', 'USER'].flatMap((layer) =>
      ['BURST_TTL_MS', 'BURST_LIMIT', 'SUSTAINED_TTL_MS', 'SUSTAINED_LIMIT'].map(
        (name) => `THROTTLE_${layer}_${name}`,
      ),
    );

    it('ships the lab-sized defaults when nothing is configured', () => {
      for (const key of keys) {
        delete process.env[key];
      }

      expect(configuration().throttle).toEqual({
        ip: { burstTtlMs: 10_000, burstLimit: 600, sustainedTtlMs: 60_000, sustainedLimit: 3000 },
        user: { burstTtlMs: 10_000, burstLimit: 100, sustainedTtlMs: 60_000, sustainedLimit: 600 },
      });
    });

    it('tunes each layer separately', () => {
      process.env.THROTTLE_IP_BURST_LIMIT = '900';
      process.env.THROTTLE_USER_SUSTAINED_LIMIT = '1200';

      const { ip, user } = configuration().throttle;
      expect(ip.burstLimit).toBe(900);
      expect(user.burstLimit).toBe(100);
      expect(user.sustainedLimit).toBe(1200);
      expect(ip.sustainedLimit).toBe(3000);
    });

    it('ignores a nonsensical limit instead of disabling the ceiling', () => {
      process.env.THROTTLE_USER_BURST_LIMIT = 'unlimited';
      process.env.THROTTLE_IP_SUSTAINED_LIMIT = '0';

      expect(configuration().throttle.user.burstLimit).toBe(100);
      expect(configuration().throttle.ip.sustainedLimit).toBe(3000);
    });
  });

  describe('coreHub.webUrl', () => {
    it('defaults to the Core Hub web app on this machine', () => {
      delete process.env.CORE_HUB_WEB_URL;
      expect(configuration().coreHub.webUrl).toBe('http://localhost:3100');
    });

    it('is read from CORE_HUB_WEB_URL', () => {
      process.env.CORE_HUB_WEB_URL = 'https://hub.example';
      expect(configuration().coreHub.webUrl).toBe('https://hub.example');
    });
  });

  describe('sso', () => {
    it('keeps the state cookie for 10 minutes by default', () => {
      delete process.env.SSO_STATE_TTL_SEC;
      expect(configuration().sso.stateTtlSec).toBe(600);
    });

    it('never lets the state cookie outlive the 600 second cap', () => {
      process.env.SSO_STATE_TTL_SEC = '3600';
      expect(configuration().sso.stateTtlSec).toBe(600);

      process.env.SSO_STATE_TTL_SEC = '120';
      expect(configuration().sso.stateTtlSec).toBe(120);
    });

    it('only accepts a same-origin post-login redirect outside /auth', () => {
      process.env.SSO_POST_LOGIN_REDIRECT = '/dashboard';
      expect(configuration().sso.postLoginRedirect).toBe('/dashboard');

      const backslash = String.fromCharCode(92);
      for (const unsafe of [
        'https://evil.example/',
        '//evil.example',
        `/${backslash}evil.example`,
        'dashboard',
        '/auth/login',
      ]) {
        process.env.SSO_POST_LOGIN_REDIRECT = unsafe;
        expect(configuration().sso.postLoginRedirect).toBe('/api/v1/me');
      }
    });
  });

  describe('database ceilings', () => {
    it('ships bounded defaults', () => {
      for (const key of [
        'DATABASE_POOL_MAX',
        'DATABASE_CONNECT_TIMEOUT_MS',
        'DATABASE_STATEMENT_TIMEOUT_MS',
        'DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS',
      ]) {
        delete process.env[key];
      }

      expect(configuration().database).toMatchObject({
        poolMax: 10,
        connectTimeoutMs: 5000,
        statementTimeoutMs: 5000,
        idleInTransactionTimeoutMs: 10_000,
      });
    });

    it('is tunable, and ignores a value that would remove the ceiling', () => {
      process.env.DATABASE_POOL_MAX = '25';
      process.env.DATABASE_STATEMENT_TIMEOUT_MS = '0';

      expect(configuration().database.poolMax).toBe(25);
      expect(configuration().database.statementTimeoutMs).toBe(5000);
    });
  });
});
