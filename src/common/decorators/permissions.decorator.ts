import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to restrict endpoint access by fine-grained RBAC permission keys.
 * Used for STAFF users who have custom roles with specific permission actions.
 *
 * @example
 * \@RequirePermissions('APPROVE_PAYMENTS', 'READ_PAYMENTS')
 * \@Post('approve/:id')
 * approve() {}
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
