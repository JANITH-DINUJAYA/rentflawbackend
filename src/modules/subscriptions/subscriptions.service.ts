import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async getAllPackages(landlordId?: string, isAdmin = false) {
    const where: any = {
      is_active: true,
      is_archived: false,
    };

    if (isAdmin) {
      // SAAS Admin view shows standard plans + all custom plans
      where.OR = undefined;
    } else if (landlordId) {
      // Landlord view shows standard plans + custom plans targeted specifically to this landlord
      where.OR = [
        { is_custom: false, target_landlord_id: null },
        { target_landlord_id: landlordId },
      ];
    } else {
      // Unauthenticated / public view shows ONLY standard public packages
      where.is_custom = false;
      where.target_landlord_id = null;
    }

    return this.prisma.subscriptionPackage.findMany({
      where,
      orderBy: { price: 'asc' },
    });
  }

  async createPackage(dto: {
    name: string;
    price: number;
    max_properties: number;
    max_tenants: number;
    max_staff: number;
    is_custom?: boolean;
    target_landlord_id?: string;
  }) {
    return this.prisma.subscriptionPackage.create({
      data: {
        name: dto.name,
        price: dto.price,
        max_properties: dto.max_properties,
        max_tenants: dto.max_tenants,
        max_staff: dto.max_staff,
        is_custom: dto.is_custom || false,
        target_landlord_id: dto.target_landlord_id || null,
      },
    });
  }

  async assignSubscription(landlordId: string, packageId: string) {
    const pkg = await this.prisma.subscriptionPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg) throw new NotFoundException('Subscription package not found');

    const existing = await this.prisma.landlordSubscription.findUnique({
      where: { landlord_id: landlordId },
      include: { package: true },
    });

    const isCurrentlyActive = existing && existing.status === 'ACTIVE' && new Date(existing.end_date) > new Date();

    if (isCurrentlyActive) {
      // Find highest priced package they paid for in the last 30 days
      const payments = await this.prisma.subscriptionBankPayment.findMany({
        where: {
          landlord_id: landlordId,
          status: 'APPROVED',
          created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { amount: true },
      });

      const maxPayment = payments.reduce((max, p) => Math.max(max, Number(p.amount)), 0);
      const maxPaidPrice = Math.max(maxPayment, Number(existing.package.price));

      if (Number(pkg.price) <= maxPaidPrice) {
        // Allow instant switch preserving the billing cycle
        return this.prisma.landlordSubscription.update({
          where: { landlord_id: landlordId },
          data: {
            package_id: packageId,
            status: 'ACTIVE',
          },
          include: { package: true },
        });
      }
    }

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
      include: { package: true },
    });
  }

  async getLandlordSubscription(landlordId: string) {
    const sub = await this.prisma.landlordSubscription.findUnique({
      where: { landlord_id: landlordId },
      include: { package: true },
    });
    if (!sub) return null;

    // Check if subscription is currently active
    const isActive = sub.status === 'ACTIVE' && new Date(sub.end_date) > new Date();

    let maxPaidPrice = 0;
    if (isActive) {
      // Find all approved payments in the last 30 days
      const payments = await this.prisma.subscriptionBankPayment.findMany({
        where: {
          landlord_id: landlordId,
          status: 'APPROVED',
          created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { amount: true },
      });

      const maxPayment = payments.reduce((max, p) => Math.max(max, Number(p.amount)), 0);
      maxPaidPrice = Math.max(maxPayment, Number(sub.package.price));
    }

    return {
      ...sub,
      max_paid_price: maxPaidPrice,
    };
  }

  async cancelSubscription(landlordId: string) {
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

    return this.prisma.subscriptionPackage.update({
      where: { id: packageId },
      data: { is_archived: true, archived_at: new Date() },
    });
  }

  // ─── CUSTOM PACKAGE REQUESTS ─────────────────
  async createCustomRequest(
    landlordId: string,
    dto: {
      max_properties: number;
      max_tenants: number;
      max_staff: number;
      notes?: string;
    },
  ) {
    return this.prisma.customPackageRequest.create({
      data: {
        landlord_id: landlordId,
        max_properties: dto.max_properties,
        max_tenants: dto.max_tenants,
        max_staff: dto.max_staff,
        notes: dto.notes,
      },
    });
  }

  async getCustomRequests(landlordId?: string) {
    return this.prisma.customPackageRequest.findMany({
      where: landlordId ? { landlord_id: landlordId } : {},
      include: {
        landlord: {
          include: {
            user: { select: { first_name: true, last_name: true, email: true, phone: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async approveCustomRequest(requestId: string, price: number) {
    const req = await this.prisma.customPackageRequest.findUnique({
      where: { id: requestId },
      include: {
        landlord: {
          include: {
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
    if (!req) throw new NotFoundException('Custom package request not found');

    const landlordName = req.landlord.company_name || `${req.landlord.user.first_name} ${req.landlord.user.last_name}`;
    const packageName = `Custom Plan (${landlordName})`;

    // Create targeted package
    const customPackage = await this.prisma.subscriptionPackage.create({
      data: {
        name: packageName,
        price,
        max_properties: req.max_properties,
        max_tenants: req.max_tenants,
        max_staff: req.max_staff,
        is_custom: true,
        target_landlord_id: req.landlord_id,
      },
    });

    // Mark request as approved
    await this.prisma.customPackageRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', offered_price: price },
    });

    return { message: 'Custom package approved & created', package: customPackage };
  }

  async rejectCustomRequest(requestId: string) {
    const req = await this.prisma.customPackageRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Custom package request not found');

    return this.prisma.customPackageRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' },
    });
  }

  // ─── BANK TRANSFER SUBSCRIPTION PAYMENTS ─────
  async submitBankPayment(
    landlordId: string,
    dto: {
      package_id: string;
      amount: number;
      receipt_url: string;
      notes?: string;
    },
  ) {
    const payment = await this.prisma.subscriptionBankPayment.create({
      data: {
        landlord_id: landlordId,
        package_id: dto.package_id,
        amount: dto.amount,
        receipt_url: dto.receipt_url,
        notes: dto.notes,
      },
      include: {
        landlord: {
          include: {
            user: { select: { first_name: true, last_name: true } }
          }
        },
        package: { select: { name: true } }
      }
    });

    // Notify all SAAS Admin users
    try {
      const admins = await this.prisma.user.findMany({
        where: { global_role: 'SAAS_ADMIN' },
        select: { id: true }
      });

      const landlordName = payment.landlord.company_name || `${payment.landlord.user.first_name} ${payment.landlord.user.last_name}`;

      for (const admin of admins) {
        await this.notifications.createNotification(
          admin.id,
          'New Subscription Payment',
          `Landlord "${landlordName}" submitted a payment slip of Rs ${dto.amount.toFixed(2)} for plan "${payment.package.name}".`,
        );
      }
    } catch (e) {
      // Don't fail the upload if notifications fail
    }

    return payment;
  }

  async getBankPayments(status?: string) {
    return this.prisma.subscriptionBankPayment.findMany({
      where: status ? { status } : {},
      include: {
        landlord: {
          include: {
            user: { select: { first_name: true, last_name: true, email: true, phone: true } },
          },
        },
        package: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async approveBankPayment(paymentId: string) {
    const p = await this.prisma.subscriptionBankPayment.findUnique({
      where: { id: paymentId },
    });
    if (!p) throw new NotFoundException('Subscription bank payment submission not found');

    // 1. Activate subscription
    await this.assignSubscription(p.landlord_id, p.package_id);

    // 2. Mark payment as approved
    return this.prisma.subscriptionBankPayment.update({
      where: { id: paymentId },
      data: { status: 'APPROVED' },
    });
  }

  async rejectBankPayment(paymentId: string, notes?: string) {
    const p = await this.prisma.subscriptionBankPayment.findUnique({
      where: { id: paymentId },
    });
    if (!p) throw new NotFoundException('Subscription bank payment submission not found');

    return this.prisma.subscriptionBankPayment.update({
      where: { id: paymentId },
      data: { status: 'REJECTED', notes },
    });
  }

  async updatePackage(
    packageId: string,
    dto: {
      name?: string;
      price?: number;
      max_properties?: number;
      max_tenants?: number;
      max_staff?: number;
      is_active?: boolean;
    },
  ) {
    const pkg = await this.prisma.subscriptionPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg) throw new NotFoundException('Subscription package not found');

    return this.prisma.subscriptionPackage.update({
      where: { id: packageId },
      data: dto,
    });
  }
}

