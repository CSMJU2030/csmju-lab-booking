/**
 * End-to-end coverage for the lab-booking domain: authentication (401),
 * authorization (403), validation (400), the response envelope and the
 * schedule CRUD, against the real NestJS stack, a fake Core Hub JWKS server
 * and an in-memory stand-in for the database.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bootApp } from './helpers/boot-app';
import { FakeCoreHub } from './helpers/fake-core-hub';
import { InMemoryPrisma } from './helpers/in-memory-prisma';
import { bangkokClock } from '../src/common/bangkok-clock';
import { TestSigningKey, createSigningKey, signCoreHubToken } from './helpers/token-factory';

const NOT_FOUND_ID = '99999999-9999-4999-8999-999999999999';

const validBody = {
  instructorName: 'Ajarn Test',
  courseCode: 'CS101',
  courseName: 'Introduction to Computing',
  roomName: 'lab1',
  day: 'MONDAY',
  startTime: '09:00',
  endTime: '12:00',
};

describe('Lab booking API (e2e)', () => {
  let coreHub: FakeCoreHub;
  let key: TestSigningKey;
  let app: NestExpressApplication;
  let db: InMemoryPrisma;
  let staffToken: string;
  let studentToken: string;

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    key = await createSigningKey('core-hub-2026');
    coreHub = new FakeCoreHub();
    await coreHub.start([key]);
    process.env.CORE_HUB_URL = coreHub.url;
    process.env.CORE_HUB_JWKS_URL = coreHub.jwksUrl;

    staffToken = await signCoreHubToken(key, { sub: 'user-003', email: 'staff@core.local', role: 'staff' });
    studentToken = await signCoreHubToken(key, { sub: 'user-002', email: 'student@core.local', role: 'student' });

    db = new InMemoryPrisma();
    app = await bootApp(db);
  });

  afterAll(async () => {
    await app.close();
    await coreHub.stop();
  });

  beforeEach(() => db.reset());

  describe('GET /api/health', () => {
    it('is public and uses the standard envelope', async () => {
      const res = await http().get('/api/health').expect(200);
      expect(res.body).toEqual({
        success: true,
        data: { status: 'ok', service: 'csmju-lab-booking' },
      });
    });
  });

  describe('authentication and authorization', () => {
    it('answers 401 without a token', async () => {
      const res = await http().get('/api/v1/schedules').expect(401);
      expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    });

    it('answers 403 when a student creates a schedule', async () => {
      const res = await http().post('/api/v1/schedules').set(as(studentToken)).send(validBody).expect(403);
      expect(res.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
    });

    it('answers 403 when a student deletes a schedule', async () => {
      await http().delete(`/api/v1/schedules/${NOT_FOUND_ID}`).set(as(studentToken)).expect(403);
    });

    it('lets a student read', async () => {
      await http().get('/api/v1/schedules').set(as(studentToken)).expect(200);
      await http().get('/api/v1/schedules/status').set(as(studentToken)).expect(200);
    });
  });

  describe('POST /api/v1/schedules', () => {
    it('creates a schedule (201) and formats times as HH:MM:SS', async () => {
      const res = await http().post('/api/v1/schedules').set(as(staffToken)).send(validBody).expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        courseCode: 'CS101',
        roomName: 'lab1',
        day: 'MONDAY',
        startTime: '09:00:00',
        endTime: '12:00:00',
      });
      expect(res.body.data.id).toEqual(expect.any(String));
    });

    it.each([
      ['a missing field', { ...validBody, courseCode: undefined }],
      ['a bad time', { ...validBody, startTime: '25:99' }],
      ['an unknown day', { ...validBody, day: 'FUNDAY' }],
      ['an unknown field', { ...validBody, extra: 1 }],
    ])('rejects %s with 400 VALIDATION_ERROR', async (_label, body) => {
      const res = await http().post('/api/v1/schedules').set(as(staffToken)).send(body).expect(400);
      expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    });

    it('rejects a class that ends before it starts', async () => {
      const res = await http()
        .post('/api/v1/schedules')
        .set(as(staffToken))
        .send({ ...validBody, startTime: '12:00', endTime: '09:00' })
        .expect(400);
      expect(res.body).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
    });
  });

  describe('GET /api/v1/schedules', () => {
    it('returns a collection with pagination meta, ordered by start time', async () => {
      await http().post('/api/v1/schedules').set(as(staffToken)).send({ ...validBody, startTime: '13:00', endTime: '15:00' });
      await http().post('/api/v1/schedules').set(as(staffToken)).send(validBody);

      const res = await http().get('/api/v1/schedules?page=1&limit=10').set(as(staffToken)).expect(200);
      expect(res.body.data.map((s: { startTime: string }) => s.startTime)).toEqual(['09:00:00', '13:00:00']);
      expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 });
    });

    it('rejects a limit above the maximum with 400', async () => {
      await http().get('/api/v1/schedules?limit=101').set(as(staffToken)).expect(400);
    });
  });

  describe('GET /api/v1/schedules/status', () => {
    it('lists every room that has a class, in name order', async () => {
      await http().post('/api/v1/schedules').set(as(staffToken)).send({ ...validBody, roomName: 'Lab คอม 4' });
      await http().post('/api/v1/schedules').set(as(staffToken)).send({ ...validBody, roomName: 'Lab คอม 3' });

      const res = await http().get('/api/v1/schedules/status').set(as(staffToken)).expect(200);
      expect(res.body.data.map((r: { roomName: string }) => r.roomName)).toEqual(['Lab คอม 3', 'Lab คอม 4']);
    });

    it('answers an empty list when there is no timetable', async () => {
      const res = await http().get('/api/v1/schedules/status').set(as(staffToken)).expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('marks a room occupied while a class is running today (Thai time)', async () => {
      await http()
        .post('/api/v1/schedules')
        .set(as(staffToken))
        .send({ ...validBody, day: bangkokClock().day, startTime: '00:00', endTime: '23:59' });

      const res = await http().get('/api/v1/schedules/status').set(as(staffToken)).expect(200);
      const lab1 = res.body.data.find((r: { roomName: string }) => r.roomName === 'lab1');
      expect(lab1).toMatchObject({ isOccupied: true, statusColor: 'red' });
    });

    it('ignores classes on other days when deciding occupancy', async () => {
      const today = bangkokClock().day;
      const otherDay = today === 'MONDAY' ? 'TUESDAY' : 'MONDAY';
      await http()
        .post('/api/v1/schedules')
        .set(as(staffToken))
        .send({ ...validBody, day: otherDay, startTime: '00:00', endTime: '23:59' });

      const res = await http().get('/api/v1/schedules/status').set(as(staffToken)).expect(200);
      const lab1 = res.body.data.find((r: { roomName: string }) => r.roomName === 'lab1');
      expect(lab1).toMatchObject({ isOccupied: false, statusColor: 'green', currentClass: null });
      expect(lab1.allSchedules).toHaveLength(1);
    });
  });

  describe('GET /api/v1/schedules/:id', () => {
    it('returns one class', async () => {
      const created = await http().post('/api/v1/schedules').set(as(staffToken)).send(validBody);
      const id = created.body.data.id as string;

      const res = await http().get(`/api/v1/schedules/${id}`).set(as(studentToken)).expect(200);
      expect(res.body.data).toMatchObject({ id, courseCode: validBody.courseCode });
    });

    it('answers 404 NOT_FOUND for an unknown id', async () => {
      const res = await http().get(`/api/v1/schedules/${NOT_FOUND_ID}`).set(as(staffToken)).expect(404);
      expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it('answers 400 for an id that is not a uuid', async () => {
      await http().get('/api/v1/schedules/not-a-uuid').set(as(staffToken)).expect(400);
    });

    it('still serves /status rather than treating it as an id', async () => {
      await http().get('/api/v1/schedules/status').set(as(staffToken)).expect(200);
    });
  });

  describe('DELETE /api/v1/schedules/:id', () => {
    it('deletes and answers { id, deleted: true }', async () => {
      const created = await http().post('/api/v1/schedules').set(as(staffToken)).send(validBody);
      const id = created.body.data.id as string;

      const res = await http().delete(`/api/v1/schedules/${id}`).set(as(staffToken)).expect(200);
      expect(res.body).toEqual({ success: true, data: { id, deleted: true } });
    });

    it('answers 404 for an unknown id', async () => {
      const res = await http().delete(`/api/v1/schedules/${NOT_FOUND_ID}`).set(as(staffToken)).expect(404);
      expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it('answers 400 for an id that is not a uuid', async () => {
      const res = await http().delete('/api/v1/schedules/not-a-uuid').set(as(staffToken)).expect(400);
      expect(res.body).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
    });
  });

  describe('GET /api/v1/rooms/check', () => {
    it('lists the classes in a room on a given day', async () => {
      await http().post('/api/v1/schedules').set(as(staffToken)).send(validBody);
      const res = await http().get('/api/v1/rooms/check?roomName=lab1&day=MONDAY').set(as(studentToken)).expect(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('rejects a missing day with 400', async () => {
      await http().get('/api/v1/rooms/check?roomName=lab1').set(as(studentToken)).expect(400);
    });
  });
});
