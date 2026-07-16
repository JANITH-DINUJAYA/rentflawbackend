import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class LandlordsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const landlord = await this.prisma.landlord.findFirst({
      where: { id },
      include: { user: true },
    });
    if (!landlord) throw new NotFoundException('Landlord profile not found');
    return landlord;
  }

  async update(id: string, dto: { company_name?: string }) {
    await this.findOne(id);
    return this.prisma.landlord.update({
      where: { id },
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.landlord.findMany({
      include: { user: true },
    });
  }
}
