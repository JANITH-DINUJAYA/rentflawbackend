import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TicketPriority, TicketStatus } from '@prisma/client';

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  async createTicket(tenantId: string, dto: { category: string; description: string; priority: TicketPriority }) {
    return this.prisma.supportTicket.create({
      data: {
        tenant_id: tenantId,
        category: dto.category,
        description: dto.description,
        priority: dto.priority,
      },
    });
  }

  async getTickets(tenantId?: string) {
    return this.prisma.supportTicket.findMany({
      where: tenantId ? { tenant_id: tenantId } : {},
      orderBy: { created_at: 'desc' },
      include: {
        tenant: { select: { first_name: true, last_name: true, email: true } },
      },
    });
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus, resolvedAt?: Date) {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        resolved_at: resolvedAt || null,
      },
    });
  }

  async getTicketsByLandlord(landlordId: string) {
    // Fetch tickets for tenants that have active agreements with this landlord
    return this.prisma.supportTicket.findMany({
      where: {
        tenant: {
          rental_agreements: {
            some: {
              landlord_id: landlordId,
              status: 'ACTIVE',
            },
          },
        },
      },
      include: {
        tenant: { select: { first_name: true, last_name: true, email: true } },
      },
    });
  }
}
