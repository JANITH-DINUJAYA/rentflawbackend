import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { enforceStaffLimit } from '../../common/middleware/subscription.middleware';

import * as bcrypt from 'bcrypt';
import { GlobalRole } from '@prisma/client';

export interface AddStaffDto {
  email: string;
  role_id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async addStaff(landlordId: string | null, dto: AddStaffDto) {
    if (landlordId !== null) {
      const sub = await this.prisma.landlordSubscription.findUnique({
        where: { landlord_id: landlordId },
        include: { package: { select: { max_staff: true } } },
      });
      if (!sub) throw new ForbiddenException('No active subscription found');

      await enforceStaffLimit(this.prisma, landlordId, sub.package.max_staff);

      const role = await this.prisma.customRole.findFirst({
        where: { id: dto.role_id, landlord_id: landlordId },
      });
      if (!role) throw new ForbiddenException('Role not found or access denied');
    } else {
      // System staff role validation
      const role = await this.prisma.customRole.findFirst({
        where: { id: dto.role_id, landlord_id: null },
      });
      if (!role) throw new ForbiddenException('System Role not found');
    }

    // Find or create user by email
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      const defaultPasswordHash = await bcrypt.hash('StaffSecure123!', 12);
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          password_hash: defaultPasswordHash,
          first_name: dto.first_name,
          last_name: dto.last_name,
          phone: dto.phone,
          nic_or_passport: 'STAFF_PROVISIONED',
          global_role: landlordId === null ? GlobalRole.SAAS_ADMIN : GlobalRole.STAFF,
        },
      });
    } else {
      // Check if user is already staff somewhere
      const existingStaff = await this.prisma.staffProfile.findUnique({
        where: { user_id: user.id },
      });
      if (existingStaff) {
        throw new ForbiddenException('User is already assigned as staff.');
      }
    }

    return this.prisma.staffProfile.create({
      data: {
        landlord_id: landlordId,
        user_id: user.id,
        role_id: dto.role_id,
      },
    });
  }

  async removeStaff(landlordId: string | null, staffId: string) {
    const member = await this.prisma.staffProfile.findFirst({
      where: {
        id: staffId,
        ...(landlordId ? { landlord_id: landlordId } : {}),
      },
    });
    if (!member) throw new NotFoundException('Staff member not found');

    return this.prisma.staffProfile.delete({
      where: { id: staffId },
    });
  }

  async getStaff(landlordId: string | null) {
    return this.prisma.staffProfile.findMany({
      where: { landlord_id: landlordId },
      include: {
        user: { select: { first_name: true, last_name: true, email: true, phone: true } },
        role: { select: { name: true } },
      },
    });
  }
}
