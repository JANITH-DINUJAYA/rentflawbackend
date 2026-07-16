import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { enforceStaffLimit } from '../../common/middleware/subscription.middleware';

export interface AddStaffDto {
  user_id: string;
  role_id: string;
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async addStaff(landlordId: string, dto: AddStaffDto) {
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

    return this.prisma.staffProfile.create({
      data: {
        landlord_id: landlordId,
        user_id: dto.user_id,
        role_id: dto.role_id,
      },
    });
  }

  async removeStaff(landlordId: string, staffId: string) {
    const member = await this.prisma.staffProfile.findFirst({
      where: { id: staffId, landlord_id: landlordId },
    });
    if (!member) throw new NotFoundException('Staff member not found');

    return this.prisma.staffProfile.delete({
      where: { id: staffId },
    });
  }

  async getStaff(landlordId: string) {
    return this.prisma.staffProfile.findMany({
      where: { landlord_id: landlordId },
      include: {
        user: { select: { first_name: true, last_name: true, email: true, phone: true } },
        role: { select: { name: true } },
      },
    });
  }
}
