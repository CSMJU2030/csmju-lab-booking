/**
 * Static environment for the e2e suite. It runs before the test file (and thus
 * before AppModule is imported and its env validation executes).
 *
 * The DATABASE_URL below is never dialled: PrismaService is replaced with an
 * in-memory double inside the suite.
 */
process.env.NODE_ENV = 'test';
// ไม่ใส่ user:password ในโค้ด (กฎ SEC-01) — ชุดนี้ไม่ได้ต่อฐานข้อมูลจริงอยู่แล้ว
// เพราะ PrismaService ถูกแทนด้วย in-memory double
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://localhost:5433/lab_booking_db_test';
process.env.CORE_HUB_ISSUER = 'core-hub';
process.env.CORE_HUB_AUDIENCE = 'csmju2030';
process.env.JWKS_CACHE_TTL_MS = '60000';
process.env.JWKS_MIN_REFRESH_INTERVAL_MS = '1';
process.env.SUBSYSTEM_ID = 'csmju-lab-booking';
process.env.CORE_HUB_WEB_URL = 'http://hub-web.test';

// ConfigModule also reads backend/.env, which differs from one machine to the
// next. Pin everything the suites assert on, so a developer's local .env
// cannot change the result. (An empty value still counts as set.)
process.env.SSO_STATE_TTL_SEC = '600';
process.env.SSO_POST_LOGIN_REDIRECT = '/api/v1/me';
process.env.TRUST_PROXY = '';

// The functional suites drive hundreds of requests from one address as fast as
// supertest can issue them. Rate limiting is proven on purpose in
// hardening.e2e-spec.ts, which boots with the shipped defaults or its own low
// limits; everywhere else both layers are raised so a 429 cannot mask a
// functional failure.
for (const layer of ['IP', 'USER']) {
  process.env[`THROTTLE_${layer}_BURST_LIMIT`] = '100000';
  process.env[`THROTTLE_${layer}_SUSTAINED_LIMIT`] = '100000';
}

// A developer's backend/.env may set LOCAL_TEST_ROLE (no Core Hub); the suites must always
// exercise the real token guard. An empty value still counts as set, so .env cannot override it.
process.env.LOCAL_TEST_ROLE = '';
