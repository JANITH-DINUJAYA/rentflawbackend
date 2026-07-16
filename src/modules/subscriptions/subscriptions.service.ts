import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async getAllPackages() {
    return this.prisma.subscriptionPackage.findMany({
      where: { is_active: true },
    });
  }

  async createPackage(dto: {
    name: string;
    price: number;
    max_properties: number;
    max_tenants: number;
    max_staff: number;
  }) {
    return this.prisma.subscriptionPackage.create({
      data: {
        name: dto.name,
        price: dto.price,
        max_properties: dto.max_properties,
        max_tenants: dto.max_tenants,
        max_staff: dto.max_staff,
      },
    });
  }

  async assignSubscription(landlordId: string, packageId: string) {
    const pkg = await this.prisma.subscriptionPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg) throw new NotFoundException('Subscription package not found');

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // 1 month duration default

    return this.prisma.landlordSubscription.upsert({
      where: { landlord_id: landlordId },
      update: {
        package_id: packageId,
        status: 'ACTIVE',
        start_date: startDate,
        end_date: endDate,
      },
      create: {
        landlord_id: landlordId,
        package_id: packageId,
        status: 'ACTIVE',
        start_date: startDate,
        end_date: endDate,
      },
    });
  }

  async getLandlordSubscription(landlordId: string) {
    const sub = await this.prisma.landlordSubscription.findUnique({
      where: { landlord_id: landlordId },
      include: { package: true },
    });
    if (!sub) throw new NotFoundException('No active subscription found');
    return sub;
  }

  async cancelSubscription(landlordId: string) {
    // Delete the landlord's subscription record
    try {
      return await this.prisma.landlordSubscription.delete({
        where: { landlord_id: landlordId },
      });
    } catch {
      throw new NotFoundException('No active subscription found to cancel');
    }
  }

  async deletePackage(packageId: string) {
    const pkg = await this.prisma.subscriptionPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg) throw new NotFoundException('Subscription package not found');

    // Block deletion if any landlord currently has an active subscription on this package
    const ongoingCount = await this.prisma.landlordSubscription.count({
      where: {
        package_id: packageId,
        status: 'ACTIVE',
      },
    });
    if (ongoingCount > 0) {
      throw new BadRequestException(
        `Cannot delete: ${ongoingCount} landlord(s) currently have an active subscription on this package.`,
      );
    }

    return this.prisma.subscriptionPackage.delete({
      where: { id: packageId },
    });
  }
}

