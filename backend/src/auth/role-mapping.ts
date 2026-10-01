import { SubsystemRole } from './core-hub-identity';

/**
 * Core Hub role -> Subsystem role (spec §14).
 *
 *   Core Hub Role      Subsystem Role
 *   ---------------------------------
 *   student            STUDENT
 *   alumni             ALUMNI
 *   staff              STAFF
 *   admin              ADMIN
 *
 * The mapping is explicit and lives only in this subsystem. The Core Hub role
 * vocabulary can change without changing subsystem authorization logic - only
 * this table changes.
 */
export const CORE_ROLE_TO_SUBSYSTEM_ROLE: Readonly<Record<string, SubsystemRole>> = Object.freeze({
  student: SubsystemRole.STUDENT,
  alumni: SubsystemRole.ALUMNI,
  staff: SubsystemRole.STAFF,
  admin: SubsystemRole.ADMIN,
});

/**
 * Returns the subsystem role for a Core Hub role, or `null` when the Core Hub
 * role has no meaning in this subsystem (authenticated, but not authorized).
 */
export function mapCoreRoleToSubsystemRole(coreRole: string | undefined): SubsystemRole | null {
  if (typeof coreRole !== 'string') {
    return null;
  }
  return CORE_ROLE_TO_SUBSYSTEM_ROLE[coreRole.trim().toLowerCase()] ?? null;
}
