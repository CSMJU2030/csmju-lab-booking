/**
 * End-to-end coverage for booking a lab: picking a date and a time slot,
 * the booking rules (opening hours, past dates, class clashes, room capacity),
 * ownership (403) and the room availability view.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { addDays, bangkokClock, dayOfWeekOf } from '../src/common/bangkok-clock';
import { toTimeDate } from '../src/prisma/time.util';
import { bootApp } from './helpers/boot-app';
import { FakeCoreHub } from './helpers/fake-core-hub';
import { InMemoryPrisma } from './helpers/in-memory-prisma';
import { TestSigningKey, createSigningKey, signCoreHubToken } from './helpers/token-factory';

const NOT_FOUND_ID = '99999999-9999-4999-8999-999999999999';

describe('Reservations API (e2e)', () => {
  let coreHub: FakeCoreHub;
  let key: TestSigningKey;
  let app: NestExpressApplication;
  let db: InMemoryPrisma;
  let staffToken: string;
  let studentToken: string;
  let otherStudentToken: string;
  let alumniToken: string;
  let roomId: string;

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());
  const tomorrow = () => addDays(bangkokClock().date, 1);

  const body = (overrides: Record<string, unknown> = {}) => ({
    roomId,
    bookingDate: tomorrow(),
    startTime: '13:00',
    endTime: '15:00',
    peopleCount: 5,
    purpose: 'ทำโปรเจกต์กลุ่ม',
    ...overrides,
  });

  const book = (token: string, overrides: Record<string, unknown> = {}) =>
    http().post('/api/v1/reservations').set(as(token)).send(body(overrides));

  beforeAll(async () => {
    key = await createSigningKey('core-hub-2026');
    coreHub = new FakeCoreHub();
    await coreHub.start([key]);
    process.env.CORE_HUB_URL = coreHub.url;
    process.env.CORE_HUB_JWKS_URL = coreHub.jwksUrl;

    staffToken = await signCoreHubToken(key, { sub: 'user-003', email: 'staff@core.local', role: 'staff' });
    studentToken = await signCoreHubToken(key, { sub: 'user-002', email: 'student@core.local', role: 'student' });
    otherStudentToken = await signCoreHubToken(key, { sub: 'user-004', email: 'other@core.local', role: 'student' });
    alumniToken = await signCoreHubToken(key, { sub: 'user-005', email: 'alumni@core.local', role: 'alumni' });

    db = new InMemoryPrisma();
    app = await bootApp(db);
  });

  afterAll(async () => {
    await app.close();
    await coreHub.stop();
  });

  beforeEach(async () => {
    db.reset();
    const room = await db.room.create({ data: { name: 'Lab คอม 3', building: 'อาคารจุฬาภรณ์' } });
    roomId = room.id;
  });

  describe('POST /api/v1/reservations', () => {
    it('books a room for a chosen date and time (201)', async () => {
      const res = await book(studentToken).expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        roomId,
        roomName: 'Lab คอม 3',
        bookingDate: tomorrow(),
        startTime: '13:00:00',
        endTime: '15:00:00',
        peopleCount: 5,
        status: 'APPROVED',
      });
      expect(db.reservation.rows[0].coreUserId).toBe('user-002');
    });

    it('answers 401 without a token', async () => {
      await http().post('/api/v1/reservations').send(body()).expect(401);
    });

    it('answers 403 to alumni (read-only)', async () => {
      const res = await book(alumniToken).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects a malformed body with 400 VALIDATION_ERROR', async () => {
      const res = await book(studentToken, { bookingDate: '06/10/2026', peopleCount: 0 }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects more than 15 people in one booking', async () => {
      await book(studentToken, { peopleCount: 16 }).expect(400);
    });

    it('rejects an end time before the start time', async () => {
      const res = await book(studentToken, { startTime: '15:00', endTime: '13:00' }).expect(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects times outside 08:00–20:00', async () => {
      await book(studentToken, { startTime: '07:00', endTime: '09:00' }).expect(400);
      await book(studentToken, { startTime: '19:00', endTime: '21:00' }).expect(400);
    });

    it('rejects a date in the past and one too far ahead', async () => {
      await book(studentToken, { bookingDate: addDays(bangkokClock().date, -1) }).expect(400);
      await book(studentToken, { bookingDate: addDays(bangkokClock().date, 31) }).expect(400);
    });

    it('answers 404 for a room that does not exist', async () => {
      await book(studentToken, { roomId: NOT_FOUND_ID }).expect(404);
    });

    it('refuses a slot that clashes with a class on that weekday (409)', async () => {
      await db.schedule.create({
        data: {
          instructorName: 'ยังไม่ระบุ',
          courseCode: '10301111',
          courseName: 'การเขียนโปรแกรมเบื้องต้น',
          roomName: 'Lab คอม 3',
          day: dayOfWeekOf(tomorrow()).day,
          startTime: toTimeDate('14:00'),
          endTime: toTimeDate('16:00'),
        },
      });
      const res = await book(studentToken).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('10301111');

      // The same slot on a different weekday is fine.
      await book(studentToken, { bookingDate: addDays(tomorrow(), 1) }).expect(201);
    });

    it('allows three groups per slot, then refuses the fourth', async () => {
      await book(studentToken).expect(201);
      await book(otherStudentToken).expect(201);
      await book(staffToken).expect(201);
      const fourth = await signCoreHubToken(key, { sub: 'user-006', email: 'x@core.local', role: 'student' });
      const res = await book(fourth).expect(409);
      expect(res.body.error.message).toContain('3 กลุ่ม');
    });

    it('fits three full groups (3 × 15 = 45 people) in one slot', async () => {
      await book(studentToken, { peopleCount: 15 }).expect(201);
      await book(otherStudentToken, { peopleCount: 15 }).expect(201);
      await book(staffToken, { peopleCount: 15 }).expect(201);
    });

    it('refuses a second overlapping booking by the same person', async () => {
      await book(studentToken).expect(201);
      const res = await book(studentToken, { startTime: '14:00', endTime: '16:00' }).expect(409);
      expect(res.body.error.message).toContain('จองห้องนี้ในช่วงเวลานี้ไว้แล้ว');
    });

    it('lets back-to-back bookings through', async () => {
      await book(studentToken, { startTime: '13:00', endTime: '14:00' }).expect(201);
      await book(studentToken, { startTime: '14:00', endTime: '15:00' }).expect(201);
    });
  });

  describe('GET /api/v1/reservations', () => {
    it('lists only my own bookings', async () => {
      await book(studentToken).expect(201);
      await book(otherStudentToken).expect(201);

      const res = await http().get('/api/v1/reservations').set(as(studentToken)).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ total: 1, page: 1 });
    });

    it('lets staff list everyone with scope=all, but not students (403)', async () => {
      await book(studentToken).expect(201);
      await book(otherStudentToken).expect(201);

      const all = await http().get('/api/v1/reservations?scope=all').set(as(staffToken)).expect(200);
      expect(all.body.data).toHaveLength(2);
      await http().get('/api/v1/reservations?scope=all').set(as(studentToken)).expect(403);
    });
  });

  describe('DELETE /api/v1/reservations/:id', () => {
    it('cancels my own booking', async () => {
      const created = await book(studentToken).expect(201);
      const id = created.body.data.id as string;
      const res = await http().delete(`/api/v1/reservations/${id}`).set(as(studentToken)).expect(200);
      expect(res.body.data).toEqual({ id, deleted: true });
      expect(db.reservation.rows).toHaveLength(0);
    });

    it("answers 403 when a student cancels someone else's booking", async () => {
      const created = await book(otherStudentToken).expect(201);
      const res = await http()
        .delete(`/api/v1/reservations/${created.body.data.id}`)
        .set(as(studentToken))
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it("lets staff cancel anyone's booking", async () => {
      const created = await book(studentToken).expect(201);
      await http().delete(`/api/v1/reservations/${created.body.data.id}`).set(as(staffToken)).expect(200);
    });

    it('answers 404 for an unknown booking and 400 for a malformed id', async () => {
      await http().delete(`/api/v1/reservations/${NOT_FOUND_ID}`).set(as(studentToken)).expect(404);
      await http().delete('/api/v1/reservations/not-a-uuid').set(as(studentToken)).expect(400);
    });
  });

  describe('GET /api/v1/rooms and availability', () => {
    it('lists the rooms', async () => {
      const res = await http().get('/api/v1/rooms').set(as(studentToken)).expect(200);
      expect(res.body.data).toEqual([{ id: roomId, name: 'Lab คอม 3', building: 'อาคารจุฬาภรณ์' }]);
    });

    it("shows that day's classes and booked slots without saying who booked", async () => {
      await db.schedule.create({
        data: {
          instructorName: 'ยังไม่ระบุ',
          courseCode: '10301111',
          courseName: 'การเขียนโปรแกรมเบื้องต้น',
          roomName: 'Lab คอม 3',
          day: dayOfWeekOf(tomorrow()).day,
          startTime: toTimeDate('09:00'),
          endTime: toTimeDate('12:00'),
        },
      });
      await book(studentToken).expect(201);

      const res = await http()
        .get(`/api/v1/rooms/${roomId}/availability?date=${tomorrow()}`)
        .set(as(otherStudentToken))
        .expect(200);

      expect(res.body.data).toMatchObject({
        roomName: 'Lab คอม 3',
        date: tomorrow(),
        classes: [{ startTime: '09:00', endTime: '12:00', title: '10301111 การเขียนโปรแกรมเบื้องต้น' }],
        bookings: [{ startTime: '13:00', endTime: '15:00', peopleCount: 5 }],
        rules: { open: '08:00', close: '20:00', maxPeoplePerBooking: 15 },
      });
      expect(JSON.stringify(res.body)).not.toContain('user-002');
    });

    it('answers 400 for a malformed date', async () => {
      await http().get(`/api/v1/rooms/${roomId}/availability?date=tomorrow`).set(as(studentToken)).expect(400);
    });
  });
});
