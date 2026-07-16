import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getIncomeReport(landlordId: string, month: number, year: number) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        landlord_id: landlordId,
        status: 'PAID',
        due_date: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        },
      },
      select: { amount: true },
    });

    const totalIncome = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    return { month, year, totalIncome };
  }

  async getOccupancyReport(landlordId: string) {
    const totalRooms = await this.prisma.room.count({
      where: { floor: { property: { landlord_id: landlordId } } },
    });

    const occupiedRooms = await this.prisma.rentalAgreement.count({
      where: { landlord_id: landlordId, status: 'ACTIVE' },
    });

    return {
      totalRooms,
      occupiedRooms,
      vacantRooms: totalRooms - occupiedRooms,
      occupancyRate: totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0,
    };
  }

  async getOverdueReport(landlordId: string) {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        landlord_id: landlordId,
        status: 'OVERDUE',
      },
      include: {
        agreement: {
          select: {
            tenant: { select: { first_name: true, last_name: true, email: true } },
          },
        },
      },
    });

    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + Number(inv.total_due), 0);
    return { overdueInvoices, totalOverdue };
  }

  async getTenantReport(landlordId: string) {
    const activeAgreements = await this.prisma.rentalAgreement.findMany({
      where: { landlord_id: landlordId, status: 'ACTIVE' },
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

    return activeAgreements.map(a => ({
      tenantName: `${a.tenant.first_name} ${a.tenant.last_name}`,
      email: a.tenant.email,
      phone: a.tenant.phone,
      propertyName: a.property.name,
      roomNumber: a.room.room_number,
      rentAmount: a.rent_amount,
    }));
  }
}
