import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

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
        rental_agreements: {
          include: {
            property: true,
            room: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
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

  async create(dto: {
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    nic_or_passport: string;
    password?: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const password = dto.password || 'TenantSecure123!';
    const passwordHash = await bcrypt.hash(password, 12);
    const tenantCode = await this.generateUniqueTenantCode();

    return this.prisma.user.create({
      data: {
        email: dto.email,
        password_hash: passwordHash,
        first_name: dto.first_name,
        last_name: dto.last_name,
        phone: dto.phone,
        nic_or_passport: dto.nic_or_passport,
        global_role: GlobalRole.TENANT,
        tenant_code: tenantCode,
      },
    });
  }

  async update(id: string, dto: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    nic_or_passport?: string;
    email?: string;
    is_active?: boolean;
  }) {
    const tenant = await this.prisma.user.findFirst({
      where: { id, global_role: GlobalRole.TENANT },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (dto.email && dto.email !== tenant.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) throw new ConflictException('Email already in use');
    }

    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    const tenant = await this.prisma.user.findFirst({
      where: { id, global_role: GlobalRole.TENANT },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.user.delete({
      where: { id },
    });
  }

  private async generateUniqueTenantCode(): Promise<string> {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
      const exists = await this.prisma.user.findUnique({
        where: { tenant_code: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    throw new BadRequestException('Failed to generate unique tenant code');
  }

  // ─── TENANTS WITH CREDIT BALANCE (Landlord) ──
  // Returns active tenants under this landlord who have overpaid credit > 0
  async findTenantsWithCredit(landlordId: string) {
    return this.prisma.user.findMany({
      where: {
        global_role: GlobalRole.TENANT,
        credit_amount: { gt: 0 },
        rental_agreements: {
          some: { landlord_id: landlordId, status: 'ACTIVE' },
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
      },
    });
  }

  // ─── PAYOUT CREDIT TO TENANT ──────────────────
  // Resets tenant credit_amount to 0 — used when landlord physically pays
  // the overpaid credit back to the tenant.
  async payoutCredit(landlordId: string, tenantId: string) {
    // Verify tenant is under this landlord
    const tenant = await this.prisma.user.findFirst({
      where: {
        id: tenantId,
        global_role: GlobalRole.TENANT,
        rental_agreements: {
          some: { landlord_id: landlordId },
        },
        credit_amount: { gt: 0 },
      },
      select: { id: true, first_name: true, last_name: true, credit_amount: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found or has no credit balance');

    const paidAmount = Number(tenant.credit_amount);

    await this.prisma.user.update({
      where: { id: tenantId },
      data: { credit_amount: 0 },
    });

    return { message: 'Credit payout processed', tenant_id: tenantId, amount_paid: paidAmount };
  }
}
