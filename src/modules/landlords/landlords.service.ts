import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class LandlordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: {
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    nic_or_passport: string;
    password?: string;
    company_name?: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const password = dto.password || 'LandlordSecure123!';
    const passwordHash = await bcrypt.hash(password, 12);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password_hash: passwordHash,
          first_name: dto.first_name,
          last_name: dto.last_name,
          phone: dto.phone,
          nic_or_passport: dto.nic_or_passport,
          global_role: GlobalRole.LANDLORD,
        },
      });

      const landlord = await tx.landlord.create({
        data: {
          user_id: user.id,
          company_name: dto.company_name,
        },
        include: { user: true },
      });

      return landlord;
    });
  }

  async findOne(id: string) {
    const landlord = await this.prisma.landlord.findFirst({
      where: { id },
      include: { user: true },
    });
    if (!landlord) throw new NotFoundException('Landlord profile not found');
    return landlord;
  }

  async update(id: string, dto: {
    company_name?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    nic_or_passport?: string;
    email?: string;
  }) {
    const landlord = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.email && dto.email !== landlord.user.email) {
        const existing = await tx.user.findUnique({
          where: { email: dto.email },
        });
        if (existing) throw new ConflictException('Email already in use');
      }

      await tx.user.update({
        where: { id: landlord.user_id },
        data: {
          first_name: dto.first_name,
          last_name: dto.last_name,
          phone: dto.phone,
          nic_or_passport: dto.nic_or_passport,
          email: dto.email,
        },
      });

      return tx.landlord.update({
        where: { id },
        data: {
          company_name: dto.company_name,
        },
        include: { user: true },
      });
    });
  }

  async delete(id: string) {
    const landlord = await this.findOne(id);
    // Delete the user which will cascade delete the landlord profile
    return this.prisma.user.delete({
      where: { id: landlord.user_id },
    });
  }

  async findAll() {
    return this.prisma.landlord.findMany({
      include: {
        user: true,
        subscription: {
          include: {
            package: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }
}
