import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class FloorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(landlordId: string, dto: { property_id: string; name: string; floor_number?: number }) {
    const property = await this.prisma.property.findFirst({
      where: { id: dto.property_id, landlord_id: landlordId, is_archived: false },
    });
    if (!property) throw new ForbiddenException('Property not found or access denied');

    return this.prisma.floor.create({
      data: {
        property_id: dto.property_id,
        name: dto.name,
        is_archived: false,
      },
    });
  }

  async findAll(propertyId: string, landlordId: string) {
    return this.prisma.floor.findMany({
      where: {
        property_id: propertyId,
        is_archived: false,
        property: {
          landlord_id: landlordId,
          is_archived: false,
        },
      },
      include: { rooms: { where: { is_archived: false } } },
    });
  }

  async findOne(id: string, landlordId: string) {
    const floor = await this.prisma.floor.findFirst({
      where: {
        id,
        is_archived: false,
        property: { landlord_id: landlordId, is_archived: false },
      },
      include: { rooms: { where: { is_archived: false } } },
    });
    if (!floor) throw new NotFoundException('Floor not found');
    return floor;
  }

  async archive(id: string, landlordId: string) {
    await this.findOne(id, landlordId);
    return this.prisma.floor.update({
      where: { id },
      data: { is_archived: true },
    });
  }
}
