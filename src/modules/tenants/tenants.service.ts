import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenantProfile(tenantId: string) {
    const tenant = await this.prisma.user.findFirst({
      where: { id: tenantId, global_role: GlobalRole.TENANT },
      include: {
        rental_agreements: {
          include: {
            property: { select: { name: true, address: true } },
            room: { select: { room_number: true } },
          },
        },
        payment_submissions: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findAll(landlordId: string) {
    // Find all users who are tenants and have active agreements under this landlord
    return this.prisma.user.findMany({
      where: {
        global_role: GlobalRole.TENANT,
        rental_agreements: {
          some: {
            landlord_id: landlordId,
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        tenant_code: true,
        credit_amount: true,
        is_active: true,
      },
    });
  }

  async findAllForAdmin() {
    return this.prisma.user.findMany({
      where: { global_role: GlobalRole.TENANT },
      include: {
        rental_agreements: true,
      },
    });
  }

  async findAllForLandlord(landlordId: string) {
    return this.prisma.user.findMany({
      where: {
        global_role: GlobalRole.TENANT,
        rental_agreements: {
          some: {
            landlord_id: landlordId,
            status: 'ACTIVE',
          },
        },
      },
      include: {
        rental_agreements: {
          where: {
            landlord_id: landlordId,
            status: 'ACTIVE',
          },
          include: {
            property: true,
            room: true,
          },
        },
      },
    });
  }
}
