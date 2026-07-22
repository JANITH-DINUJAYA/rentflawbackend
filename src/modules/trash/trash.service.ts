import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole } from '@prisma/client';

export interface TrashItem {
  id: string;
  entity_type: string;
  name: string;
  archived_at: Date | null;
  days_remaining: number;
  details?: string;
}

@Injectable()
export class TrashService {
  constructor(private readonly prisma: PrismaService) {}

  async getTrashItems(user: any): Promise<TrashItem[]> {
    const isLandlordOrStaff = user.global_role === GlobalRole.LANDLORD || user.global_role === GlobalRole.STAFF;
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    const isAdmin = user.global_role === GlobalRole.SAAS_ADMIN;

    const items: TrashItem[] = [];
    const now = new Date();

    const calcDaysRemaining = (archivedAt: Date | null) => {
      if (!archivedAt) return 30;
      const elapsed = Math.floor((now.getTime() - new Date(archivedAt).getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(0, 30 - elapsed);
    };

    if (isLandlordOrStaff && landlordId) {
      // 1. Properties
      const properties = await this.prisma.property.findMany({
        where: { landlord_id: landlordId, is_archived: true },
      });
      properties.forEach(p => items.push({
        id: p.id,
        entity_type: 'Property',
        name: p.name,
        archived_at: p.updated_at,
        days_remaining: calcDaysRemaining(p.updated_at),
        details: p.address,
      }));

      // 2. Floors
      const floors = await this.prisma.floor.findMany({
        where: { property: { landlord_id: landlordId }, is_archived: true },
        include: { property: { select: { name: true } } },
      });
      floors.forEach(f => items.push({
        id: f.id,
        entity_type: 'Floor',
        name: f.name,
        archived_at: f.updated_at,
        days_remaining: calcDaysRemaining(f.updated_at),
        details: `Property: ${f.property.name}`,
      }));

      // 3. Rooms
      const rooms = await this.prisma.room.findMany({
        where: { floor: { property: { landlord_id: landlordId } }, is_archived: true },
        include: { floor: { include: { property: { select: { name: true } } } } },
      });
      rooms.forEach(r => items.push({
        id: r.id,
        entity_type: 'Room',
        name: `Room ${r.room_number}`,
        archived_at: r.updated_at,
        days_remaining: calcDaysRemaining(r.updated_at),
        details: `${r.floor.property.name} - ${r.floor.name}`,
      }));

      // 4. Utility Bills
      const utilities = await this.prisma.utilityBill.findMany({
        where: { landlord_id: landlordId, is_archived: true },
      });
      utilities.forEach(u => items.push({
        id: u.id,
        entity_type: 'Utility Bill',
        name: `${u.type} Bill (Rs ${Number(u.amount).toFixed(2)})`,
        archived_at: u.updated_at,
        days_remaining: calcDaysRemaining(u.updated_at),
      }));

      // 5. Staff Profiles
      const staff = await this.prisma.staffProfile.findMany({
        where: { landlord_id: landlordId, is_archived: true },
        include: { user: { select: { first_name: true, last_name: true, email: true } } },
      });
      staff.forEach((s: any) => items.push({
        id: s.id,
        entity_type: 'Staff Profile',
        name: s.user ? `${s.user.first_name} ${s.user.last_name}` : 'Staff Member',
        archived_at: s.updated_at,
        days_remaining: calcDaysRemaining(s.updated_at),
        details: s.user?.email || '',
      }));

      // 6. Rental Agreements
      const agreements = await this.prisma.rentalAgreement.findMany({
        where: { landlord_id: landlordId, is_archived: true },
        include: {
          tenant: { select: { first_name: true, last_name: true } },
          room: { select: { room_number: true } },
          property: { select: { name: true } },
        },
      });
      agreements.forEach(a => items.push({
        id: a.id,
        entity_type: 'Rental Agreement',
        name: `Lease for Room ${a.room.room_number}`,
        archived_at: a.updated_at,
        days_remaining: calcDaysRemaining(a.updated_at),
        details: `Tenant: ${a.tenant.first_name} ${a.tenant.last_name} (${a.property.name})`,
      }));
    } else if (isAdmin) {
      // Admin sees packages and users archived
      const packages = await this.prisma.subscriptionPackage.findMany({
        where: { is_archived: true },
      });
      packages.forEach(p => items.push({
        id: p.id,
        entity_type: 'Subscription Package',
        name: p.name,
        archived_at: p.archived_at || p.updated_at,
        days_remaining: calcDaysRemaining(p.archived_at || p.updated_at),
        details: `Rs ${Number(p.price).toFixed(2)}/mo`,
      }));

      const users = await this.prisma.user.findMany({
        where: { is_active: false },
      });
      users.forEach(u => items.push({
        id: u.id,
        entity_type: u.global_role === 'LANDLORD' ? 'Landlord' : u.global_role === 'TENANT' ? 'Tenant' : 'Deactivated User',
        name: `${u.first_name} ${u.last_name}`,
        archived_at: u.updated_at,
        days_remaining: calcDaysRemaining(u.updated_at),
        details: u.global_role === 'LANDLORD' ? `${u.email} (Landlord)` : `${u.email} (Tenant)`,
      }));
    }

    return items.sort((a, b) => b.days_remaining - a.days_remaining);
  }

  async restoreItem(entityType: string, id: string) {
    const type = entityType.toLowerCase();
    switch (type) {
      case 'property':
        return this.prisma.property.update({ where: { id }, data: { is_archived: false } });
      case 'floor':
        return this.prisma.floor.update({ where: { id }, data: { is_archived: false } });
      case 'room':
        return this.prisma.room.update({ where: { id }, data: { is_archived: false } });
      case 'utility bill':
      case 'utilitybill':
        return this.prisma.utilityBill.update({ where: { id }, data: { is_archived: false } });
      case 'staff profile':
      case 'staffprofile':
        return this.prisma.staffProfile.update({ where: { id }, data: { is_archived: false } });
      case 'subscription package':
      case 'subscriptionpackage':
        return this.prisma.subscriptionPackage.update({ where: { id }, data: { is_archived: false, archived_at: null } });
      case 'deactivated user':
      case 'user':
      case 'landlord':
      case 'tenant':
        return this.prisma.user.update({ where: { id }, data: { is_active: true } });
      case 'rental agreement':
      case 'rentalagreement':
        return this.prisma.rentalAgreement.update({ where: { id }, data: { is_archived: false } });
      default:
        throw new BadRequestException(`Unknown entity type for restoration: ${entityType}`);
    }
  }

  async permanentDelete(entityType: string, id: string) {
    const type = entityType.toLowerCase();
    try {
      switch (type) {
        case 'property':
          return await this.prisma.$transaction(async (tx) => {
            const floors = await tx.floor.findMany({ where: { property_id: id }, select: { id: true } });
            const floorIds = floors.map(f => f.id);
            const rooms = await tx.room.findMany({ where: { floor_id: { in: floorIds } }, select: { id: true } });
            const roomIds = rooms.map(r => r.id);
            const agreements = await tx.rentalAgreement.findMany({
              where: { OR: [{ property_id: id }, { room_id: { in: roomIds } }] },
              select: { id: true },
            });
            const agreementIds = agreements.map(a => a.id);
            const invoices = await tx.invoice.findMany({ where: { agreement_id: { in: agreementIds } }, select: { id: true } });
            const invoiceIds = invoices.map(i => i.id);

            // 1. Delete payments and utility bills
            await tx.paymentSubmission.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
            await tx.utilityBill.deleteMany({ where: { invoice_id: { in: invoiceIds } } });

            // 2. Delete invoices
            await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });

            // 3. Delete agreements
            await tx.rentalAgreement.deleteMany({ where: { id: { in: agreementIds } } });

            // 4. Delete rooms & floors
            await tx.room.deleteMany({ where: { id: { in: roomIds } } });
            await tx.floor.deleteMany({ where: { id: { in: floorIds } } });

            // 5. Delete property
            return tx.property.delete({ where: { id } });
          });

        case 'floor':
          return await this.prisma.$transaction(async (tx) => {
            const rooms = await tx.room.findMany({ where: { floor_id: id }, select: { id: true } });
            const roomIds = rooms.map(r => r.id);
            const agreements = await tx.rentalAgreement.findMany({ where: { room_id: { in: roomIds } }, select: { id: true } });
            const agreementIds = agreements.map(a => a.id);
            const invoices = await tx.invoice.findMany({ where: { agreement_id: { in: agreementIds } }, select: { id: true } });
            const invoiceIds = invoices.map(i => i.id);

            await tx.paymentSubmission.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
            await tx.utilityBill.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
            await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
            await tx.rentalAgreement.deleteMany({ where: { id: { in: agreementIds } } });
            await tx.room.deleteMany({ where: { id: { in: roomIds } } });
            return tx.floor.delete({ where: { id } });
          });

        case 'room':
          return await this.prisma.$transaction(async (tx) => {
            const agreements = await tx.rentalAgreement.findMany({ where: { room_id: id }, select: { id: true } });
            const agreementIds = agreements.map(a => a.id);
            const invoices = await tx.invoice.findMany({ where: { agreement_id: { in: agreementIds } }, select: { id: true } });
            const invoiceIds = invoices.map(i => i.id);

            await tx.paymentSubmission.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
            await tx.utilityBill.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
            await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
            await tx.rentalAgreement.deleteMany({ where: { id: { in: agreementIds } } });
            return tx.room.delete({ where: { id } });
          });

        case 'utility bill':
        case 'utilitybill':
          return await this.prisma.utilityBill.delete({ where: { id } });
        case 'staff profile':
        case 'staffprofile':
          return await this.prisma.staffProfile.delete({ where: { id } });
        case 'subscription package':
        case 'subscriptionpackage':
          return await this.prisma.subscriptionPackage.delete({ where: { id } });
        case 'deactivated user':
        case 'user':
          return await this.prisma.user.delete({ where: { id } });
        case 'landlord':
          return await this.prisma.$transaction(async (tx) => {
            const landlord = await tx.landlord.findUnique({ where: { user_id: id } });
            if (landlord) {
              await tx.landlordSubscription.deleteMany({ where: { landlord_id: landlord.id } });
              await tx.customPackageRequest.deleteMany({ where: { landlord_id: landlord.id } });
              await tx.staffProfile.deleteMany({ where: { landlord_id: landlord.id } });
              await tx.rentalAgreement.deleteMany({ where: { landlord_id: landlord.id } });
              await tx.property.deleteMany({ where: { landlord_id: landlord.id } });
              await tx.landlord.delete({ where: { id: landlord.id } });
            }
            return tx.user.delete({ where: { id } });
          });
        case 'tenant':
          return await this.prisma.$transaction(async (tx) => {
            await tx.rentalAgreement.deleteMany({ where: { tenant_id: id } });
            await tx.paymentSubmission.deleteMany({ where: { tenant_id: id } });
            return tx.user.delete({ where: { id } });
          });
        case 'rental agreement':
        case 'rentalagreement':
          return await this.prisma.$transaction(async (tx) => {
            const invoices = await tx.invoice.findMany({ where: { agreement_id: id }, select: { id: true } });
            const invoiceIds = invoices.map(inv => inv.id);
            await tx.paymentSubmission.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
            await tx.utilityBill.deleteMany({ where: { invoice_id: { in: invoiceIds } } });
            await tx.invoice.deleteMany({ where: { agreement_id: id } });
            await tx.depositRefund.deleteMany({ where: { agreement_id: id } });
            return tx.rentalAgreement.delete({ where: { id } });
          });
        default:
          throw new BadRequestException(`Unknown entity type for permanent deletion: ${entityType}`);
      }
    } catch (err: any) {
      throw new NotFoundException(`Failed to permanently delete ${entityType} record: ${err.message}`);
    }
  }
}
