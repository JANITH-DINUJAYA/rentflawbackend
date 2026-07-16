import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../database/prisma.service';

/**
 * Subscription Enforcement Middleware
 *
 * Intercepts mutating requests to landlord-owned resources and
 * enforces hard limits defined in their SubscriptionPackage.
 *
 * Attached selectively to specific routes — not globally applied.
 *
 * Limit checks:
 * - max_properties: enforced on POST /properties
 * - max_tenants: enforced on POST /agreements (new tenant assignment)
 * - max_staff: enforced on POST /staff
 *
 * If landlord subscription is SUSPENDED or PAST_DUE beyond grace,
 * write operations are blocked (read-only mode enforced).
 */
@Injectable()
export class SubscriptionEnforcementMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;

    // Only enforce for LANDLORD role — other roles bypass
    if (!user || user.global_role !== 'LANDLORD') {
      return next();
    }

    const landlord = await this.prisma.landlord.findUnique({
      where: { user_id: user.id },
      select: { id: true },
    });

    if (!landlord) {
      throw new NotFoundException('Landlord profile not found');
    }

    const subscription = await this.prisma.landlordSubscription.findUnique({
      where: { landlord_id: landlord.id },
      include: {
        package: {
          select: {
            max_properties: true,
            max_tenants: true,
            max_staff: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new ForbiddenException('No active subscription found');
    }

    // Block write operations for SUSPENDED accounts
    if (subscription.status === 'SUSPENDED') {
      throw new ForbiddenException(
        'Your account is suspended. Please renew your subscription.',
      );
    }

    // Enforce read-only mode for PAST_DUE
    if (subscription.status === 'PAST_DUE' && req.method !== 'GET') {
      throw new ForbiddenException(
        'Subscription payment overdue. Data is in read-only mode.',
      );
    }

    // Attach limits to request for downstream checks
    (req as any).subscriptionLimits = subscription.package;
    (req as any).landlordId = landlord.id;

    next();
  }
}

/**
 * Standalone helper used inside service methods to check specific limits.
 * Call before creating properties, agreements, or staff.
 */
export async function enforcePropertyLimit(
  prisma: PrismaService,
  landlordId: string,
  maxProperties: number,
) {
  const count = await prisma.property.count({
    where: { landlord_id: landlordId, is_archived: false },
  });

  if (count >= maxProperties) {
    throw new ForbiddenException(
      `Property limit reached (${maxProperties}). Upgrade your plan to add more properties.`,
    );
  }
}

export async function enforceStaffLimit(
  prisma: PrismaService,
  landlordId: string,
  maxStaff: number,
) {
  const count = await prisma.staffProfile.count({
    where: { landlord_id: landlordId },
  });

  if (count >= maxStaff) {
    throw new ForbiddenException(
      `Staff limit reached (${maxStaff}). Upgrade your plan to add more staff.`,
    );
  }
}

export async function enforceTenantLimit(
  prisma: PrismaService,
  landlordId: string,
  maxTenants: number,
) {
  // Count active agreements (one agreement = one active tenant slot)
  const count = await prisma.rentalAgreement.count({
    where: {
      landlord_id: landlordId,
      status: 'ACTIVE',
    },
  });

  if (count >= maxTenants) {
    throw new ForbiddenException(
      `Active tenant limit reached (${maxTenants}). Upgrade your plan to accept more tenants.`,
    );
  }
}
