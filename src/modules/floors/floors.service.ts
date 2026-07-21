import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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

  async update(id: string, landlordId: string, dto: { name: string }) {
    await this.findOne(id, landlordId);
    return this.prisma.floor.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  async archive(id: string, landlordId: string) {
    await this.findOne(id, landlordId);

    const activeAgreements = await this.prisma.rentalAgreement.count({
      where: {
        room: { floor_id: id },
        status: 'ACTIVE',
      },
    });
    if (activeAgreements > 0) {
      throw new BadRequestException('Cannot archive floor: Active agreements exist in rooms on this floor.');
    }

    return this.prisma.floor.update({
      where: { id },
      data: { is_archived: true, updated_at: new Date() },
    });
  }

  async bulkArchive(ids: string[], landlordId: string) {
    // Check active agreements on all selected floors
    const activeAgreements = await this.prisma.rentalAgreement.count({
      where: {
        room: { floor_id: { in: ids } },
        status: 'ACTIVE',
      },
    });
    if (activeAgreements > 0) {
      throw new BadRequestException('Cannot archive selected floors: One or more rooms have active agreements.');
    }

    // Verify all floors belong to the landlord
    const floorsCount = await this.prisma.floor.count({
      where: {
        id: { in: ids },
        property: { landlord_id: landlordId },
      },
    });
    if (floorsCount !== ids.length) {
      throw new ForbiddenException('Some floors do not exist or access is denied.');
    }

    return this.prisma.floor.updateMany({
      where: { id: { in: ids } },
      data: { is_archived: true, updated_at: new Date() },
    });
  }
}
