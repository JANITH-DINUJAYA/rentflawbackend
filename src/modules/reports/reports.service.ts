import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AgreementStatus, InvoiceStatus } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getIncomeReport(landlordId: string | null, month: number, year: number) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        ...(landlordId ? { landlord_id: landlordId } : {}),
        status: InvoiceStatus.PAID,
        due_date: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        },
      },
      select: { amount: true },
    });

    const totalIncome = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    return { month, year, totalIncome, invoicesCount: invoices.length };
  }

  async getOccupancyReport(landlordId: string | null) {
    const totalRooms = await this.prisma.room.count({
      where: landlordId
        ? { floor: { property: { landlord_id: landlordId } } }
        : {},
    });

    const occupiedRooms = await this.prisma.rentalAgreement.count({
      where: {
        status: AgreementStatus.ACTIVE,
        ...(landlordId ? { landlord_id: landlordId } : {}),
      },
    });

    return {
      totalRooms,
      occupiedRooms,
      vacantRooms: totalRooms - occupiedRooms,
      occupancyRate: totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0,
    };
  }

  async getOverdueReport(landlordId: string | null) {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        ...(landlordId ? { landlord_id: landlordId } : {}),
        status: InvoiceStatus.OVERDUE,
      },
      include: {
        agreement: {
          include: {
            tenant: { select: { first_name: true, last_name: true, email: true } },
            property: { select: { name: true } },
          },
        },
      },
    });

    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + Number(inv.total_due), 0);
    return { overdueInvoices, totalOverdue };
  }

  async getTenantReport(landlordId: string | null) {
    const activeAgreements = await this.prisma.rentalAgreement.findMany({
      where: {
        status: AgreementStatus.ACTIVE,
        ...(landlordId ? { landlord_id: landlordId } : {}),
      },
      include: {
        tenant: {
          select: {
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
          },
        },
        room: { select: { room_number: true } },
        property: { select: { name: true } },
      },
    });

    return activeAgreements.map((a: any) => ({
      tenantName: `${a.tenant.first_name} ${a.tenant.last_name}`,
      email: a.tenant.email,
      phone: a.tenant.phone,
      propertyName: a.property.name,
      roomNumber: a.room.room_number,
      rentAmount: a.rent_amount,
    }));
  }
}
