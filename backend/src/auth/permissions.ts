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

  /** Book a lab for yourself. */
  RESERVATION_CREATE_OWN = 'reservation:create:own',
  /** See your own bookings / everyone's bookings. */
  RESERVATION_READ_OWN = 'reservation:read:own',
  RESERVATION_READ_ANY = 'reservation:read:any',
  /** Cancel your own booking / anyone's booking. */
  RESERVATION_DELETE_OWN = 'reservation:delete:own',
  RESERVATION_DELETE_ANY = 'reservation:delete:any',
}

const READ_ONLY: Permission[] = [Permission.SCHEDULE_READ, Permission.ROOM_READ];

/** Booking a lab for yourself, seeing and cancelling your own bookings. */
const OWN_BOOKINGS: Permission[] = [
  Permission.RESERVATION_CREATE_OWN,
  Permission.RESERVATION_READ_OWN,
  Permission.RESERVATION_DELETE_OWN,
];

/** Students look at timetables and room availability, and book labs. */
const STUDENT_PERMISSIONS: Permission[] = [...READ_ONLY, ...OWN_BOOKINGS];

/** Alumni get the read-only view (no booking). */
const ALUMNI_PERMISSIONS: Permission[] = [...READ_ONLY];

/** Staff (including lecturers) maintain the lab timetables and manage every booking. */
const STAFF_PERMISSIONS: Permission[] = [
  ...READ_ONLY,
  Permission.SCHEDULE_CREATE,
  Permission.SCHEDULE_DELETE,
  ...OWN_BOOKINGS,
  Permission.RESERVATION_READ_ANY,
  Permission.RESERVATION_DELETE_ANY,
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
