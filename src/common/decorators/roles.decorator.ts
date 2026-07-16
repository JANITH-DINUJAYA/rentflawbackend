import { SetMetadata } from '@nestjs/common';
import { GlobalRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator to restrict endpoint access to specific global roles.
 * Used in combination with RolesGuard.
 *
 * @example
 * \@Roles(GlobalRole.SAAS_ADMIN, GlobalRole.LANDLORD)
 * \@Get('properties')
 * findAll() {}
 */
export const Roles = (...roles: GlobalRole[]) => SetMetadata(ROLES_KEY, roles);
