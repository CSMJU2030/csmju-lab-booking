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
