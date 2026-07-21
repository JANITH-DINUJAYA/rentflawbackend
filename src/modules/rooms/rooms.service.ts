import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OccupancyType } from '@prisma/client';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    landlordId: string,
    dto: { floor_id: string; room_number: string; occupancy_type: OccupancyType; capacity?: number; base_rent: number },
  ) {
    const floor = await this.prisma.floor.findFirst({
      where: {
        id: dto.floor_id,
        is_archived: false,
        property: { landlord_id: landlordId, is_archived: false },
      },
    });
    if (!floor) throw new ForbiddenException('Floor not found or access denied');

    try {
      return await this.prisma.room.create({
        data: {
          floor_id: dto.floor_id,
          room_number: dto.room_number,
          occupancy_type: dto.occupancy_type,
          capacity: dto.capacity ?? 1,
          base_rent: dto.base_rent,
          is_archived: false,
        },
      });
    } catch (err: any) {
      throw new BadRequestException(
        `Failed to add room: ${err.message || "database conflict"}`,
      );
    }
  }

  async findAll(landlordId: string) {
    return this.prisma.room.findMany({
      where: {
        is_archived: false,
        floor: {
          is_archived: false,
          property: { landlord_id: landlordId, is_archived: false },
        },
      },
      include: { floor: true },
    });
  }

  async findOne(id: string, landlordId: string) {
    const room = await this.prisma.room.findFirst({
      where: {
        id,
        is_archived: false,
        floor: {
          is_archived: false,
          property: { landlord_id: landlordId, is_archived: false },
        },
      },
      include: { floor: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async update(
    id: string,
    landlordId: string,
    dto: {
      room_number?: string;
      occupancy_type?: OccupancyType;
      capacity?: number;
      base_rent?: number;
    },
  ) {
    await this.findOne(id, landlordId);
    return this.prisma.room.update({
      where: { id },
      data: {
        room_number: dto.room_number,
        occupancy_type: dto.occupancy_type,
        capacity: dto.capacity,
        base_rent: dto.base_rent,
      },
    });
  }

  async archive(id: string, landlordId: string) {
    await this.findOne(id, landlordId);

    const activeAgreements = await this.prisma.rentalAgreement.count({
      where: { room_id: id, status: 'ACTIVE' },
    });
    if (activeAgreements > 0) {
      throw new BadRequestException('Cannot archive room with active agreements');
    }

    return this.prisma.room.update({
      where: { id },
      data: { is_archived: true, updated_at: new Date() },
    });
  }

  async bulkArchive(ids: string[], landlordId: string) {
    // Check active agreements on all selected rooms
    const activeAgreements = await this.prisma.rentalAgreement.count({
      where: {
        room_id: { in: ids },
        status: 'ACTIVE',
      },
    });
    if (activeAgreements > 0) {
      throw new BadRequestException('Cannot archive selected rooms: One or more rooms have active agreements.');
    }

    // Verify all rooms belong to the landlord
    const roomsCount = await this.prisma.room.count({
      where: {
        id: { in: ids },
        floor: { property: { landlord_id: landlordId } },
      },
    });
    if (roomsCount !== ids.length) {
      throw new ForbiddenException('Some rooms do not exist or access is denied.');
    }

    return this.prisma.room.updateMany({
      where: { id: { in: ids } },
      data: { is_archived: true, updated_at: new Date() },
    });
  }

  async getOccupancyStats(landlordId: string): Promise<{
    total_rooms: number;
    occupied_rooms: number;
    vacant_rooms: number;
    shared_rooms: number;
  }> {
    const rooms = await this.prisma.room.findMany({
      where: {
        is_archived: false,
        floor: {
          is_archived: false,
          property: { landlord_id: landlordId, is_archived: false },
        },
      },
      include: {
        agreements: { where: { status: 'ACTIVE' } },
      },
    });

    const total_rooms = rooms.length;
    const occupied_rooms = rooms.filter((r) => r.agreements.length > 0).length;
    const shared_rooms = rooms.filter((r) => r.occupancy_type === OccupancyType.SHARED).length;
    const vacant_rooms = total_rooms - occupied_rooms;

    return { total_rooms, occupied_rooms, vacant_rooms, shared_rooms };
  }
}
