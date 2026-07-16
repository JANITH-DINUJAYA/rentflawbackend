import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PropertyType } from '@prisma/client';
import {
  enforcePropertyLimit,
} from '../../common/middleware/subscription.middleware';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  // ─── CREATE PROPERTY ───────────────────────────
  async create(
    landlordId: string,
    dto: { name: string; address: string; type: PropertyType },
  ) {
    // Fetch subscription limits and enforce before creating
    const sub = await this.prisma.landlordSubscription.findUnique({
      where: { landlord_id: landlordId },
      include: { package: { select: { max_properties: true } } },
    });

    if (!sub) throw new ForbiddenException('No active subscription');

    await enforcePropertyLimit(this.prisma, landlordId, sub.package.max_properties);

    return this.prisma.property.create({
      data: {
        landlord_id: landlordId,
        name: dto.name,
        address: dto.address,
        type: dto.type,
      },
    });
  }

  // ─── LIST PROPERTIES ───────────────────────────
  async findAll(landlordId: string, includeArchived = false) {
    return this.prisma.property.findMany({
      where: {
        landlord_id: landlordId,
        is_archived: includeArchived ? undefined : false,
      },
      orderBy: { created_at: 'desc' },
      include: {
        floors: {
          where: { is_archived: false },
          include: {
            rooms: {
              where: { is_archived: false },
              select: { id: true, room_number: true, occupancy_type: true, capacity: true, base_rent: true },
            },
          },
        },
      },
    });
  }

  // ─── GET SINGLE PROPERTY ──────────────────────
  async findOne(landlordId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, landlord_id: landlordId },
      include: {
        floors: {
          where: { is_archived: false },
          include: {
            rooms: { where: { is_archived: false } },
          },
        },
      },
    });

    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  // ─── UPDATE PROPERTY ──────────────────────────
  async update(
    landlordId: string,
    propertyId: string,
    dto: { name?: string; address?: string; type?: PropertyType },
  ) {
    await this.findOne(landlordId, propertyId);
    return this.prisma.property.update({
      where: { id: propertyId },
      data: dto,
    });
  }

  // ─── ARCHIVE PROPERTY ─────────────────────────
  // Blocks archiving if active tenants or pending invoices exist
  async archive(landlordId: string, propertyId: string) {
    await this.findOne(landlordId, propertyId);

    const activeAgreements = await this.prisma.rentalAgreement.count({
      where: { property_id: propertyId, status: 'ACTIVE' },
    });

    if (activeAgreements > 0) {
      throw new ConflictException(
        `Cannot archive: ${activeAgreements} active agreement(s) exist on this property. Terminate all agreements first.`,
      );
    }

    const pendingInvoices = await this.prisma.invoice.count({
      where: {
        landlord_id: landlordId,
        agreement: { property_id: propertyId },
        status: { in: ['PENDING', 'OVERDUE'] },
      },
    });

    if (pendingInvoices > 0) {
      throw new ConflictException(
        `Cannot archive: ${pendingInvoices} pending/overdue invoice(s) remain.`,
      );
    }

    return this.prisma.property.update({
      where: { id: propertyId },
      data: { is_archived: true },
    });
  }
}
