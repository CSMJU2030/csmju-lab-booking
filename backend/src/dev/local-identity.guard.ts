import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CoreHubIdentity } from '../auth/core-hub-identity';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { mapCoreRoleToSubsystemRole } from '../auth/role-mapping';

/**
 * TEMPORARY - local development without a Core Hub.
 *
 * Active only when LOCAL_TEST_ROLE is set (student | alumni | staff | admin).
 * It replaces CoreHubJwtGuard, so NO token is verified: every request becomes
 * that one fixed test user. It never reads a header, cookie or body to decide
 * who the caller is, and env.validation refuses to boot with it in production.
 *
 * While it is on, the subsystem does not meet the auth contract and conformance
 * will fail. To connect the real Core Hub, delete LOCAL_TEST_ROLE from .env,
 * then remove this folder and its two references in app.module.ts and
 * env.validation.ts.
 */
@Injectable()
export class LocalIdentityGuard implements CanActivate {
  private readonly identity: CoreHubIdentity;

  constructor(private readonly reflector: Reflector) {
    const coreRole = String(process.env.LOCAL_TEST_ROLE).trim().toLowerCase();
    const subsystemRole = mapCoreRoleToSubsystemRole(coreRole);
    if (!subsystemRole) {
      throw new Error(`LOCAL_TEST_ROLE must be student, alumni, staff or admin (got "${coreRole}")`);
    }

    this.identity = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'local-test@localhost',
      coreRole,
      subsystemRole,
      expiresAt: null,
    };

    new Logger('LocalIdentityGuard').warn(
      `LOCAL_TEST_ROLE=${coreRole}: authentication is OFF, every request is the test user. Never use this outside a developer machine.`,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    context.switchToHttp().getRequest<Request & { user?: CoreHubIdentity }>().user = this.identity;
    return true;
  }
}
