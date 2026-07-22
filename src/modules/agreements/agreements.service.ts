import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AgreementStatus, LeavingOption, OccupancyType } from '@prisma/client';
import { enforceTenantLimit } from '../../common/middleware/subscription.middleware';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AgreementsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── CREATE AGREEMENT ─────────────────────────
  async create(
    landlordId: string,
    dto: {
      tenant_id: string;
      property_id: string;
      room_id: string;
      rent_amount: number;
      security_deposit: number;
      start_date: Date;
      end_date: Date;
      collection_day: number;
      grace_period_days: number;
      late_fee_flat: number;
      // leaving_option is set at creation — not at exit
      leaving_option: LeavingOption;
      // Required when leaving_option = DECIDE_IN_AGREEMENT
      // Landlord must choose the actual rule at agreement creation
      leaving_rule?: LeavingOption;
    },
  ) {
    // Validate: DECIDE_IN_AGREEMENT requires a leaving_rule
    if (
      dto.leaving_option === LeavingOption.DECIDE_IN_AGREEMENT &&
      !dto.leaving_rule
    ) {
      throw new BadRequestException(
        'When leaving_option is DECIDE_IN_AGREEMENT, you must specify leaving_rule (PAY_STAY_DATES or PAY_FULL_MONTH)',
      );
    }

    // Validate: leaving_rule must not be DECIDE_IN_AGREEMENT itself
    if (dto.leaving_rule === LeavingOption.DECIDE_IN_AGREEMENT) {
      throw new BadRequestException(
        'leaving_rule cannot be DECIDE_IN_AGREEMENT. Choose PAY_STAY_DATES or PAY_FULL_MONTH',
      );
    }

    // Enforce subscription tenant limit
    const sub = await this.prisma.landlordSubscription.findUnique({
      where: { landlord_id: landlordId },
      include: { package: { select: { max_tenants: true } } },
    });

    if (sub) {
      await enforceTenantLimit(this.prisma, landlordId, sub.package.max_tenants);
    }

    // Verify tenant exists and is a TENANT role
    const tenant = await this.prisma.user.findFirst({
      where: { id: dto.tenant_id, global_role: 'TENANT', is_active: true },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found or is inactive');

    // Verify room belongs to landlord and is not archived
    const room = await this.prisma.room.findFirst({
      where: {
        id: dto.room_id,
        is_archived: false,
        floor: {
          property: {
            landlord_id: landlordId,
            is_archived: false,
          },
        },
      },
      select: { id: true, occupancy_type: true, capacity: true, room_number: true },
    });
    if (!room) throw new NotFoundException('Room not found');

    // Check room capacity for ENTIRE rooms
    if (room.occupancy_type === OccupancyType.ENTIRE) {
      const activeOnRoom = await this.prisma.rentalAgreement.count({
        where: { room_id: dto.room_id, status: AgreementStatus.ACTIVE },
      });
      if (activeOnRoom > 0) {
        throw new ConflictException(
          'This room is already occupied. ENTIRE rooms allow only one active tenant.',
        );
      }
    }

    // Check shared room capacity
    if (room.occupancy_type === OccupancyType.SHARED) {
      const occupants = await this.prisma.rentalAgreement.count({
        where: { room_id: dto.room_id, status: AgreementStatus.ACTIVE },
      });
      if (occupants >= room.capacity) {
        throw new ConflictException(
          `This shared room is at full capacity (${room.capacity}/${room.capacity}).`,
        );
      }
    }

    // Check collection_day is valid (1–28 safe for all months)
    if (dto.collection_day < 1 || dto.collection_day > 28) {
      throw new BadRequestException('collection_day must be between 1 and 28');
    }

    const agreement = await this.prisma.rentalAgreement.create({
      data: {
        landlord_id: landlordId,
        tenant_id: dto.tenant_id,
        property_id: dto.property_id,
        room_id: dto.room_id,
        rent_amount: dto.rent_amount,
        security_deposit: dto.security_deposit,
        start_date: dto.start_date,
        end_date: dto.end_date,
        collection_day: dto.collection_day,
        grace_period_days: dto.grace_period_days,
        late_fee_flat: dto.late_fee_flat,
        leaving_option: dto.leaving_option,
        leaving_rule: dto.leaving_rule ?? null,
        status: AgreementStatus.DRAFT,
      },
    });

    // Notify tenant
    await this.notifications.createNotification(
      dto.tenant_id,
      'New Lease Invitation',
      `You have received a new lease invitation for Room ${room.room_number || ''}. Please review and accept it.`,
    );

    return agreement;
  }

  // ─── ACTIVATE AGREEMENT ───────────────────────
  async activate(landlordId: string, agreementId: string) {
    const agreement = await this.prisma.rentalAgreement.findFirst({
      where: { id: agreementId, landlord_id: landlordId, status: AgreementStatus.DRAFT },
      include: { room: true },
    });
    if (!agreement) throw new NotFoundException('Draft agreement not found');

    const updated = await this.prisma.rentalAgreement.update({
      where: { id: agreementId },
      data: { status: AgreementStatus.ACTIVE },
    });

    // Notify tenant
    await this.notifications.createNotification(
      agreement.tenant_id,
      'Lease Activated',
      `Your lease agreement for Room ${agreement.room.room_number} has been activated by the landlord.`,
    );

    return updated;
  }

  // ─── ACCEPT INVITATION (TENANT) ────────────────
  async acceptInvitation(tenantId: string, agreementId: string) {
    const agreement = await this.prisma.rentalAgreement.findFirst({
      where: { id: agreementId, tenant_id: tenantId, status: AgreementStatus.DRAFT },
      include: { room: true },
    });
    if (!agreement) throw new NotFoundException('Pending lease invitation not found');

    const updated = await this.prisma.rentalAgreement.update({
      where: { id: agreementId },
      data: { status: AgreementStatus.ACTIVE },
    });

    // Notify landlord
    const landlordUser = await this.prisma.landlord.findUnique({
      where: { id: agreement.landlord_id },
      select: { user_id: true },
    });
    if (landlordUser) {
      await this.notifications.createNotification(
        landlordUser.user_id,
        'Lease Invitation Accepted',
        `The tenant has accepted your lease invitation for Room ${agreement.room.room_number}. The lease is now Active.`,
      );
    }

    return updated;
  }

  // ─── REQUEST TERMINATION (TENANT) ───────────────────────
  async requestTermination(tenantId: string, agreementId: string) {
    const agreement = await this.prisma.rentalAgreement.findFirst({
      where: { id: agreementId, tenant_id: tenantId, status: AgreementStatus.ACTIVE },
      include: { room: true, tenant: true },
    });
    if (!agreement) throw new NotFoundException('Active rental agreement not found');

    // Block if tenant has unpaid (PENDING or OVERDUE) invoices on this agreement
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        agreement_id: agreementId,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      select: { id: true, total_due: true, due_date: true, status: true },
      orderBy: { due_date: 'asc' },
    });

    if (unpaidInvoices.length > 0) {
      const totalOwed = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.total_due), 0);
      throw new BadRequestException(
        `You have ${unpaidInvoices.length} unpaid invoice(s) totalling Rs ${totalOwed.toFixed(2)}. Please settle all outstanding dues before requesting to leave.`,
      );
    }

    const updated = await this.prisma.rentalAgreement.update({
      where: { id: agreementId },
      data: { status: AgreementStatus.TERMINATION_REQUESTED },
    });

    // Notify landlord
    const landlordUser = await this.prisma.landlord.findUnique({
      where: { id: agreement.landlord_id },
      select: { user_id: true },
    });
    if (landlordUser) {
      await this.notifications.createNotification(
        landlordUser.user_id,
        'Leave Request Submitted',
        `${agreement.tenant.first_name} ${agreement.tenant.last_name} has requested to leave Room ${agreement.room.room_number}.`,
      );
    }

    return updated;
  }

  // ─── CALCULATE TERMINATION COST (TENANT & LANDLORD PREVIEW) ──
  async calculateTerminationCost(actorId: string, isTenant: boolean, agreementId: string) {
    const where: any = { id: agreementId };
    if (isTenant) {
      where.tenant_id = actorId;
      where.status = AgreementStatus.ACTIVE;
    } else {
      where.landlord_id = actorId;
    }

    const agreement = await this.prisma.rentalAgreement.findFirst({
      where,
      select: {
        id: true,
        rent_amount: true,
        security_deposit: true,
        leaving_option: true,
        leaving_rule: true,
        collection_day: true,
        start_date: true,
      },
    });
    if (!agreement) throw new NotFoundException('Rental agreement not found');

    // Find all unpaid invoices
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        agreement_id: agreementId,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      select: { id: true, total_due: true, due_date: true, status: true },
      orderBy: { due_date: 'asc' },
    });

    const totalOutstanding = unpaidInvoices.reduce((s, i) => s + Number(i.total_due), 0);

    // Calculate prorated exit cost for today
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDate = new Date(agreement.start_date);
    const startMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

    const activeRule =
      agreement.leaving_option === LeavingOption.DECIDE_IN_AGREEMENT
        ? agreement.leaving_rule!
        : agreement.leaving_option;

    let finalInvoiceAmount: number;
    let daysToPayFor: number;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    if (activeRule === LeavingOption.PAY_FULL_MONTH) {
      finalInvoiceAmount = Number(agreement.rent_amount);
      daysToPayFor = daysInMonth;
    } else {
      // PAY_STAY_DATES: prorate for actual days stayed in the current month
      if (startMidnight > todayMidnight) {
        // Agreement hasn't started yet — no days to pay for
        daysToPayFor = 0;
      } else if (
        startDate.getFullYear() === today.getFullYear() &&
        startDate.getMonth() === today.getMonth()
      ) {
        // Started this month — count from start day to today inclusive
        daysToPayFor = today.getDate() - startDate.getDate() + 1;
      } else {
        // Started in a previous month — count from 1st of month to today
        daysToPayFor = today.getDate();
      }
      finalInvoiceAmount = parseFloat(
        ((Number(agreement.rent_amount) / daysInMonth) * daysToPayFor).toFixed(2),
      );
    }

    return {
      leaving_option: activeRule,
      final_invoice_amount: finalInvoiceAmount,
      days_to_pay_for: daysToPayFor,
      security_deposit: Number(agreement.security_deposit),
      unpaid_invoices: unpaidInvoices,
      total_outstanding: totalOutstanding,
      can_request_leave: unpaidInvoices.length === 0,
    };
  }

  // ─── TERMINATE AGREEMENT ──────────────────────
  // Calculates the final invoice, processes security deposit offset if requested,
  // marks unpaid invoices as PAID, and logs the DepositRefund.
  async terminate(
    landlordId: string | null,
    agreementId: string,
    exitDate: Date,
    deductFromDeposit?: boolean,
    deductionReason?: string,
  ) {
    const where: any = {
      id: agreementId,
      status: { in: [AgreementStatus.ACTIVE, AgreementStatus.TERMINATION_REQUESTED] },
    };
    if (landlordId) {
      where.landlord_id = landlordId;
    }

    const agreement = await this.prisma.rentalAgreement.findFirst({
      where,
      select: {
        id: true,
        tenant_id: true,
        rent_amount: true,
        security_deposit: true,
        leaving_option: true,
        leaving_rule: true,
        collection_day: true,
        room: { select: { room_number: true } },
      },
    });

    if (!agreement) throw new NotFoundException('Active or termination-pending agreement not found');

    // Determine final billing amount based on leaving_option (set at creation)
    const activeRule =
      agreement.leaving_option === LeavingOption.DECIDE_IN_AGREEMENT
        ? agreement.leaving_rule!
        : agreement.leaving_option;

    let finalInvoiceAmount: number;

    if (activeRule === LeavingOption.PAY_FULL_MONTH) {
      finalInvoiceAmount = Number(agreement.rent_amount);
    } else {
      // PAY_STAY_DATES: prorate for actual days stayed in exit month
      const exitDay = exitDate.getDate();
      const year = exitDate.getFullYear();
      const month = exitDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      finalInvoiceAmount = parseFloat(
        ((Number(agreement.rent_amount) / daysInMonth) * exitDay).toFixed(2),
      );
    }

    // Load unpaid invoices to resolve if offsetting
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        agreement_id: agreementId,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
    });

    const totalOutstanding = unpaidInvoices.reduce((s, i) => s + Number(i.total_due), 0);
    const totalDeductions = totalOutstanding + finalInvoiceAmount;
    const securityDeposit = Number(agreement.security_deposit);

    let refundAmount = securityDeposit;
    if (deductFromDeposit) {
      refundAmount = Math.max(0, securityDeposit - totalDeductions);
    }

    // Perform database updates inside a safe prisma transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Terminate agreement
      await tx.rentalAgreement.update({
        where: { id: agreementId },
        data: { status: AgreementStatus.TERMINATED, end_date: exitDate },
      });

      // 2. Resolve outstanding invoices if offsetting
      if (deductFromDeposit) {
        await tx.invoice.updateMany({
          where: {
            agreement_id: agreementId,
            status: { in: ['PENDING', 'OVERDUE'] },
          },
          data: { status: 'PAID' },
        });
      }

      // 3. Always create deposit refund record
      await tx.depositRefund.create({
        data: {
          agreement_id: agreementId,
          refund_amount: refundAmount,
          deductions: deductFromDeposit ? Math.min(securityDeposit, totalDeductions) : 0,
          reason: deductFromDeposit
            ? (deductionReason || `Offset outstanding dues (Rs ${totalOutstanding.toFixed(2)}) & final month prorated rent (Rs ${finalInvoiceAmount.toFixed(2)}).`)
            : 'No deposit deductions. Full deposit refund processed.',
          processed_at: new Date(),
        },
      });
    });

    // Notify tenant
    await this.notifications.createNotification(
      agreement.tenant_id,
      'Lease Terminated',
      `Your lease agreement for Room ${agreement.room.room_number} has been officially terminated. ${deductFromDeposit ? `Dues offset from deposit. Refund amount: Rs ${refundAmount.toFixed(2)}.` : `Final prorated invoice of Rs ${finalInvoiceAmount.toFixed(2)} generated.`}`,
    );

    return {
      message: 'Agreement terminated',
      leaving_rule_applied: activeRule,
      final_invoice_amount: finalInvoiceAmount,
      offset_applied: deductFromDeposit || false,
      refund_amount: refundAmount,
    };
  }

  // ─── LIST AGREEMENTS ──────────────────────────
  async findAll(landlordId: string, status?: AgreementStatus) {
    const where: any = { landlord_id: landlordId };
    if (status) where.status = status;

    return this.prisma.rentalAgreement.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        tenant: { select: { first_name: true, last_name: true, email: true, tenant_code: true } },
        property: { select: { name: true, type: true } },
        room: { select: { room_number: true, occupancy_type: true, base_rent: true } },
        invoices: {
          where: { status: { in: ['PENDING', 'OVERDUE'] } },
          select: { id: true, total_due: true, due_date: true, status: true },
          orderBy: { due_date: 'asc' },
          take: 1,
        },
      },
    });
  }

  // ─── TENANT'S AGREEMENTS HISTORY ─────────────
  // Includes all agreements across all landlords — portable rental history
  async findTenantHistory(tenantId: string) {
    return this.prisma.rentalAgreement.findMany({
      where: { tenant_id: tenantId },
      orderBy: { start_date: 'desc' },
      include: {
        property: { select: { name: true, address: true, type: true } },
        room: { select: { room_number: true } },
        landlord: {
          include: {
            user: { select: { first_name: true, last_name: true, phone: true } },
          },
        },
        deposit_refund: true,
      },
    });
  }

  // ─── GET SINGLE AGREEMENT ─────────────────────
  async findOne(landlordId: string | null, agreementId: string) {
    const where: any = { id: agreementId };
    if (landlordId) {
      where.landlord_id = landlordId;
    }
    const agreement = await this.prisma.rentalAgreement.findFirst({
      where,
      include: {
        tenant: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, credit_amount: true } },
        property: true,
        room: true,
        invoices: { orderBy: { due_date: 'desc' } },
        deposit_refund: true,
      },
    });

    if (!agreement) throw new NotFoundException('Agreement not found');
    return agreement;
  }

  // ─── SYSTEM ADMIN: LIST ALL AGREEMENTS ─────────
  async findAllAdmin(status?: AgreementStatus) {
    const where: any = {};
    if (status) where.status = status;

    return this.prisma.rentalAgreement.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        tenant: { select: { first_name: true, last_name: true, email: true, tenant_code: true } },
        property: { select: { name: true, type: true } },
        room: { select: { room_number: true, occupancy_type: true, base_rent: true } },
        invoices: {
          where: { status: { in: ['PENDING', 'OVERDUE'] } },
          select: { id: true, total_due: true, due_date: true, status: true },
          orderBy: { due_date: 'asc' },
          take: 1,
        },
      },
    });
  }

  // ─── LIST DEPOSIT REFUNDS (Landlord) ──────────
  // Returns all deposit refund records for agreements owned by this landlord,
  // including tenant info and refund payment status.
  async findAllRefunds(landlordId: string) {
    return this.prisma.depositRefund.findMany({
      where: {
        agreement: { landlord_id: landlordId },
      },
      orderBy: { created_at: 'desc' },
      include: {
        agreement: {
          select: {
            id: true,
            end_date: true,
            rent_amount: true,
            security_deposit: true,
            tenant: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, tenant_code: true } },
            property: { select: { name: true } },
            room: { select: { room_number: true } },
          },
        },
      },
    });
  }

  // ─── MARK DEPOSIT REFUND AS PAID ──────────────
  // Landlord confirms they have physically paid the refund to the tenant.
  async markRefundPaid(landlordId: string, refundId: string) {
    const refund = await this.prisma.depositRefund.findFirst({
      where: {
        id: refundId,
        agreement: { landlord_id: landlordId },
      },
      include: {
        agreement: {
          include: {
            tenant: true,
            property: true,
          },
        },
      },
    });
    if (!refund) throw new NotFoundException('Deposit refund not found');
    if (refund.is_paid) throw new BadRequestException('Refund is already marked as paid');

    const updated = await this.prisma.depositRefund.update({
      where: { id: refundId },
      data: { is_paid: true },
    });

    const tenant = refund.agreement.tenant;
    // 1. In-app database notification
    await this.notifications.createNotification(
      tenant.id,
      'Deposit Refund Processed',
      `Your security deposit refund of Rs ${Number(refund.refund_amount).toFixed(2)} for ${refund.agreement.property.name} has been marked as Paid by the landlord.`,
    );

    // 2. Email notification
    await this.notifications.sendDepositRefundPaid(
      tenant.email,
      `${tenant.first_name} ${tenant.last_name}`,
      Number(refund.refund_amount),
      refund.agreement.property.name,
    );

    return updated;
  }
}

