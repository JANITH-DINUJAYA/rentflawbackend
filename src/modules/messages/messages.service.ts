import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole } from '@prisma/client';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(
    senderId: string,
    dto: { receiver_id?: string; to_admin?: boolean; content: string },
  ) {
    if (!dto.content || dto.content.trim() === '') {
      throw new BadRequestException('Message content cannot be empty');
    }

    if (!dto.to_admin && !dto.receiver_id) {
      throw new BadRequestException(
        'Must specify either receiver_id or to_admin = true',
      );
    }

    return this.prisma.message.create({
      data: {
        sender_id: senderId,
        receiver_id: dto.to_admin ? null : dto.receiver_id,
        to_admin: dto.to_admin || false,
        content: dto.content,
      },
      include: {
        sender: { select: { first_name: true, last_name: true, email: true, global_role: true } },
        receiver: { select: { first_name: true, last_name: true, email: true, global_role: true } },
      },
    });
  }

  async getConversations(userId: string, role: GlobalRole, landlordId?: string) {
    // Return all messages that the user has sent or received, or messages for their workspace
    // So the frontend can construct thread lists dynamically.
    const whereClause: any = {
      OR: [
        { sender_id: userId },
        { receiver_id: userId },
      ],
    };

    // If Landlord or Landlord Staff, they also see messages sent to/from the landlord user account
    if ((role === GlobalRole.LANDLORD || role === GlobalRole.STAFF) && landlordId) {
      // Find the landlord's user_id
      const landlord = await this.prisma.landlord.findUnique({
        where: { id: landlordId },
        select: { user_id: true },
      });
      if (landlord) {
        whereClause.OR.push({ sender_id: landlord.user_id });
        whereClause.OR.push({ receiver_id: landlord.user_id });
      }
    }

    // If SaaS Admin, they also see all messages sent to support queue (to_admin = true)
    if (role === GlobalRole.SAAS_ADMIN) {
      whereClause.OR.push({ to_admin: true });
    }

    return this.prisma.message.findMany({
      where: whereClause,
      orderBy: { created_at: 'asc' },
      include: {
        sender: { select: { id: true, first_name: true, last_name: true, email: true, global_role: true } },
        receiver: { select: { id: true, first_name: true, last_name: true, email: true, global_role: true } },
      },
    });
  }

  async markConversationRead(userId: string, otherPartyId: string) {
    return this.prisma.message.updateMany({
      where: {
        sender_id: otherPartyId,
        receiver_id: userId,
        is_read: false,
      },
      data: { is_read: true },
    });
  }

  async markSupportRead() {
    return this.prisma.message.updateMany({
      where: {
        to_admin: true,
        is_read: false,
      },
      data: { is_read: true },
    });
  }

  async markSupportReadForSender(senderId: string) {
    return this.prisma.message.updateMany({
      where: {
        sender_id: senderId,
        to_admin: true,
        is_read: false,
      },
      data: { is_read: true },
    });
  }

  async getInboxContacts(userId: string, role: GlobalRole, landlordId?: string) {
    // Helper to return candidates they can chat with:
    // - Tenant can chat with Landlord and Landlord Staff, and System Support
    // - Landlord can chat with Tenants and System Support
    // - SaaS Admin can chat with everyone

    if (role === GlobalRole.TENANT) {
      // Find active agreements for this tenant to get landlord details
      const agreements = await this.prisma.rentalAgreement.findMany({
        where: { tenant_id: userId, status: 'ACTIVE' },
        include: {
          landlord: {
            include: {
              user: { select: { id: true, first_name: true, last_name: true, email: true, global_role: true } },
              staff_profiles: {
                include: {
                  user: { select: { id: true, first_name: true, last_name: true, email: true, global_role: true } },
                },
              },
            },
          },
        },
      });

      const contacts: any[] = [];
      const addedIds = new Set<string>();

      for (const agr of agreements) {
        const llUser = agr.landlord.user;
        if (!addedIds.has(llUser.id)) {
          contacts.push({ ...llUser, label: 'Landlord' });
          addedIds.add(llUser.id);
        }
        for (const staff of agr.landlord.staff_profiles) {
          const staffUser = staff.user;
          if (!addedIds.has(staffUser.id)) {
            contacts.push({ ...staffUser, label: 'Landlord Staff' });
            addedIds.add(staffUser.id);
          }
        }
      }

      return contacts;
    }

    if (role === GlobalRole.LANDLORD || role === GlobalRole.STAFF) {
      // Find active tenants for this landlord
      const agreements = await this.prisma.rentalAgreement.findMany({
        where: {
          landlord_id: landlordId,
          status: 'ACTIVE',
        },
        include: {
          tenant: { select: { id: true, first_name: true, last_name: true, email: true, global_role: true } },
        },
      });

      const contacts: any[] = [];
      const addedIds = new Set<string>();

      for (const agr of agreements) {
        const tenantUser = agr.tenant;
        if (!addedIds.has(tenantUser.id)) {
          contacts.push({ ...tenantUser, label: 'Tenant' });
          addedIds.add(tenantUser.id);
        }
      }

      return contacts;
    }

    if (role === GlobalRole.SAAS_ADMIN) {
      // SaaS admin can see all landlords and tenants
      const users = await this.prisma.user.findMany({
        where: {
          global_role: { in: [GlobalRole.LANDLORD, GlobalRole.TENANT] },
        },
        select: { id: true, first_name: true, last_name: true, email: true, global_role: true },
      });
      return users.map(u => ({ ...u, label: u.global_role }));
    }

    return [];
  }
}
