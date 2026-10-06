import { SubsystemRole } from './core-hub-identity';
import { Permission, ROLE_PERMISSIONS, can, canAny } from './permissions';

describe('Subsystem permission model (spec §15, §16)', () => {
  describe('STUDENT and ALUMNI', () => {
    it.each([SubsystemRole.STUDENT, SubsystemRole.ALUMNI])('%s is read-only', (role) => {
      expect(can(role, Permission.SCHEDULE_READ)).toBe(true);
      expect(can(role, Permission.ROOM_READ)).toBe(true);
      expect(can(role, Permission.SCHEDULE_CREATE)).toBe(false);
      expect(can(role, Permission.SCHEDULE_DELETE)).toBe(false);
    });
  });

  describe('bookings', () => {
    it('lets a student book and cancel only their own bookings', () => {
      const role = SubsystemRole.STUDENT;
      expect(can(role, Permission.RESERVATION_CREATE_OWN)).toBe(true);
      expect(can(role, Permission.RESERVATION_READ_OWN)).toBe(true);
      expect(can(role, Permission.RESERVATION_DELETE_OWN)).toBe(true);
      expect(can(role, Permission.RESERVATION_READ_ANY)).toBe(false);
      expect(can(role, Permission.RESERVATION_DELETE_ANY)).toBe(false);
    });

    it('does not let alumni book', () => {
      expect(can(SubsystemRole.ALUMNI, Permission.RESERVATION_CREATE_OWN)).toBe(false);
    });

    it('lets staff see and cancel every booking', () => {
      expect(can(SubsystemRole.STAFF, Permission.RESERVATION_READ_ANY)).toBe(true);
      expect(can(SubsystemRole.STAFF, Permission.RESERVATION_DELETE_ANY)).toBe(true);
    });
  });

  describe('STAFF', () => {
    it('maintains the lab timetables', () => {
      const role = SubsystemRole.STAFF;
      expect(can(role, Permission.SCHEDULE_READ)).toBe(true);
      expect(can(role, Permission.SCHEDULE_CREATE)).toBe(true);
      expect(can(role, Permission.SCHEDULE_DELETE)).toBe(true);
    });
  });

  describe('ADMIN', () => {
    it('holds every permission', () => {
      for (const permission of Object.values(Permission)) {
        expect(can(SubsystemRole.ADMIN, permission)).toBe(true);
      }
    });
  });

  it('canAny passes when at least one permission is held', () => {
    expect(
      canAny(SubsystemRole.STUDENT, [Permission.SCHEDULE_CREATE, Permission.SCHEDULE_READ]),
    ).toBe(true);
    expect(canAny(SubsystemRole.STUDENT, [Permission.SCHEDULE_CREATE])).toBe(false);
  });

  it('every role has an entry', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(['ADMIN', 'ALUMNI', 'STAFF', 'STUDENT']);
  });
});
