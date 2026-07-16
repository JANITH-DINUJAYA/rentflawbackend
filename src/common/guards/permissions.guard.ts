import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { GlobalRole } from '@prisma/client';

/**
 * Fine-grained RBAC guard for STAFF users.
 *
 * Checks if the authenticated STAFF user's custom role has the
 * required permission actions defined by @RequirePermissions().
 *
 * Non-STAFF users (LANDLORD, SAAS_ADMIN) bypass this guard
 * since they have inherent permissions.
 *
 * Flow:
 * 1. Read required permissions from decorator metadata
 * 2. Skip if user is SAAS_ADMIN or LANDLORD (they have full access)
 * 3. For STAFF: load their CustomRole's Permissions from DB
 * 4. Check all required permissions exist in the loaded set
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePermissions() decorator
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // SAAS_ADMIN and LANDLORD bypass permission checks
    if (
      user.global_role === GlobalRole.SAAS_ADMIN ||
      user.global_role === GlobalRole.LANDLORD
    ) {
      return true;
    }

    // For STAFF: load their assigned role's permissions
    if (user.global_role === GlobalRole.STAFF) {
      const staffProfile = await this.prisma.staffProfile.findUnique({
        where: { user_id: user.id },
        include: {
          role: {
            include: {
              permissions: {
                select: { action: true },
              },
            },
          },
        },
      });

      if (!staffProfile) {
        throw new ForbiddenException('Staff profile not found');
      }

      const userPermissions = staffProfile.role.permissions.map(
        (p) => p.action,
      );

      // Verify all required permissions are present
      const hasAll = requiredPermissions.every((perm) =>
        userPermissions.includes(perm),
      );

      if (!hasAll) {
        throw new ForbiddenException(
          `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
        );
      }

      return true;
    }

    // TENANT role cannot access staff/landlord operations
    throw new ForbiddenException('Access denied for this role');
  }
}
