import { SubsystemRole } from './core-hub-identity';

/**
 * Subsystem permissions (spec §16).
 *
 *   Core JWT -> Core Role -> Subsystem Role -> Permission -> Business Operation
 *
 * Business code asks for a permission, never for `role === 'admin'`.
 */
export enum Permission {
  /** See lab timetables and the live room status. */
  SCHEDULE_READ = 'schedule:read',
  /** Add or remove a class in a lab timetable (instructors and admins). */
  SCHEDULE_CREATE = 'schedule:create',
  SCHEDULE_DELETE = 'schedule:delete',

  /** Check whether a room is free at a given time. */
  ROOM_READ = 'room:read',
}

const READ_ONLY: Permission[] = [Permission.SCHEDULE_READ, Permission.ROOM_READ];

/** Students look at timetables and room availability. */
const STUDENT_PERMISSIONS: Permission[] = [...READ_ONLY];

/** Alumni get the same read-only view. */
const ALUMNI_PERMISSIONS: Permission[] = [...READ_ONLY];

/** Staff (including lecturers) maintain the lab timetables. */
const STAFF_PERMISSIONS: Permission[] = [
  ...READ_ONLY,
  Permission.SCHEDULE_CREATE,
  Permission.SCHEDULE_DELETE,
];

const ADMIN_PERMISSIONS: Permission[] = Object.values(Permission);

export const ROLE_PERMISSIONS: Readonly<Record<SubsystemRole, readonly Permission[]>> =
  Object.freeze({
    [SubsystemRole.STUDENT]: Object.freeze(STUDENT_PERMISSIONS),
    [SubsystemRole.ALUMNI]: Object.freeze(ALUMNI_PERMISSIONS),
    [SubsystemRole.STAFF]: Object.freeze(STAFF_PERMISSIONS),
    [SubsystemRole.ADMIN]: Object.freeze(ADMIN_PERMISSIONS),
  });

/** Does this subsystem role hold the given permission? */
export function can(role: SubsystemRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Does this subsystem role hold at least one of the given permissions? */
export function canAny(role: SubsystemRole, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}
