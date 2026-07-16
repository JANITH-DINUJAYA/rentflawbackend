import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // ─── SEARCH TENANT BY CODE ────────────────────
  // Landlords use tenant_code to find and invite tenants
  async findByTenantCode(tenantCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { tenant_code: tenantCode },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        tenant_code: true,
        global_role: true,
        is_active: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`No tenant found with code: ${tenantCode}`);
    }

    if (user.global_role !== GlobalRole.TENANT) {
      throw new ForbiddenException('This code does not belong to a tenant account');
    }

    return user;
  }

  // ─── GET ALL TENANTS (Admin only) ─────────────
  async getAllTenants(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { global_role: GlobalRole.TENANT },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          phone: true,
          tenant_code: true,
          is_active: true,
          credit_amount: true,
          created_at: true,
        },
      }),
      this.prisma.user.count({ where: { global_role: GlobalRole.TENANT } }),
    ]);

    return { users, total, page, limit };
  }

  // ─── GET ALL LANDLORDS (Admin only) ───────────
  async getAllLandlords(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [landlords, total] = await this.prisma.$transaction([
      this.prisma.landlord.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
              phone: true,
              is_active: true,
            },
          },
          subscription: {
            include: {
              package: { select: { name: true, price: true } },
            },
          },
        },
      }),
      this.prisma.landlord.count(),
    ]);

    return { landlords, total, page, limit };
  }

  // ─── GET USER BY ID ────────────────────────────
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        nic_or_passport: true,
        global_role: true,
        is_active: true,
        tenant_code: true,
        credit_amount: true,
        created_at: true,
        landlord_profile: {
          select: {
            id: true,
            company_name: true,
            subscription_status: true,
            subscription_end: true,
          },
        },
        staff_profile: {
          select: {
            id: true,
            landlord_id: true,
            role: {
              select: {
                name: true,
                permissions: { select: { action: true } },
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ─── UPDATE USER PROFILE ───────────────────────
  async updateProfile(
    userId: string,
    dto: { first_name?: string; last_name?: string; phone?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        phone: true,
        email: true,
        updated_at: true,
      },
    });
  }

  // ─── TOGGLE USER ACTIVE STATUS (Admin/Landlord) ──
  async toggleActive(userId: string, is_active: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { is_active },
      select: { id: true, is_active: true, email: true },
    });
  }

  // ─── CHANGE PASSWORD ─────────────────────────
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password_hash: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new ForbiddenException('Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: newHash },
    });

    return { message: 'Password updated successfully' };
  }

  // ─── HARD DELETE (Admin only) ────────────────
  // Only safe if no active agreements or submitted payments
  async deleteUser(userId: string) {
    const activeAgreements = await this.prisma.rentalAgreement.count({
      where: { tenant_id: userId, status: 'ACTIVE' },
    });

    if (activeAgreements > 0) {
      throw new ConflictException(
        'Cannot delete a user with active rental agreements. Terminate agreements first.',
      );
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { message: 'User account deleted successfully' };
  }
}
