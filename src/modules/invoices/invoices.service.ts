import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InvoiceStatus, InvoiceType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  // ─── GET INVOICES (Landlord-scoped) ────────────
  async findAll(
    landlordId: string,
    filters: { status?: InvoiceStatus; agreementId?: string; page?: number; limit?: number },
  ) {
    const { status, agreementId, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = { landlord_id: landlordId };
    if (status) where.status = status;
    if (agreementId) where.agreement_id = agreementId;

    const [invoices, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { due_date: 'asc' },
        include: {
          agreement: {
            select: {
              tenant: { select: { first_name: true, last_name: true, email: true } },
              room: { select: { room_number: true } },
              property: { select: { name: true } },
            },
          },
          utility_bill: true,
          payment_submissions: {
            select: { id: true, status: true, amount_paid: true, payment_date: true },
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { invoices, total, page, limit };
  }

  // ─── GET TENANT'S INVOICES ─────────────────────
  async findTenantInvoices(tenantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [invoices, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: { agreement: { tenant_id: tenantId } },
        skip,
        take: limit,
        orderBy: { due_date: 'desc' },
        include: {
          agreement: {
            select: {
              property: { select: { name: true, address: true } },
              room: { select: { room_number: true } },
              landlord: { select: { company_name: true, user: { select: { first_name: true, last_name: true, phone: true } } } },
            },
          },
          utility_bill: true,
          payment_submissions: {
            select: { id: true, status: true, amount_paid: true, receipt_url: true },
            orderBy: { created_at: 'desc' },
          },
        },
      }),
      this.prisma.invoice.count({ where: { agreement: { tenant_id: tenantId } } }),
    ]);

    return { invoices, total, page, limit };
  }

  // ─── GET SINGLE INVOICE ────────────────────────
  async findOne(landlordId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, landlord_id: landlordId },
      include: {
        agreement: {
          include: {
            tenant: { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
            property: true,
            room: true,
          },
        },
        utility_bill: true,
        payment_submissions: {
          orderBy: { created_at: 'desc' },
          include: {
            reviewer: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  // ─── MANUAL INVOICE CREATION (Damage, Utility) ──
  async createManual(
    landlordId: string,
    dto: {
      agreement_id: string;
      type: InvoiceType;
      amount: number;
      discount?: number;
      due_date: Date;
      billing_period_start: Date;
      billing_period_end: Date;
      notes?: string;
    },
  ) {
    const agreement = await this.prisma.rentalAgreement.findFirst({
      where: { id: dto.agreement_id, landlord_id: landlordId },
      select: { id: true },
    });

    if (!agreement) throw new NotFoundException('Agreement not found');

    const discount = dto.discount ?? 0;
    const total_due = dto.amount - discount;

    return this.prisma.invoice.create({
      data: {
        landlord_id: landlordId,
        agreement_id: dto.agreement_id,
        type: dto.type,
        amount: dto.amount,
        discount,
        total_due,
        due_date: dto.due_date,
        billing_period_start: dto.billing_period_start,
        billing_period_end: dto.billing_period_end,
      },
    });
  }

  // ─── APPLY DISCOUNT ───────────────────────────
  async applyDiscount(landlordId: string, invoiceId: string, discount: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, landlord_id: landlordId, status: 'PENDING' },
    });

    if (!invoice) throw new NotFoundException('Invoice not found or already processed');

    const newTotal = Number(invoice.amount) - discount + Number(invoice.late_fee_applied);

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        discount,
        total_due: newTotal < 0 ? 0 : newTotal,
      },
    });
  }

  // ─── MARK OVERDUE ─────────────────────────────
  // Called by BullMQ daily job. Marks PENDING invoices past grace period as OVERDUE.
  async markOverdueInvoices() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.prisma.invoice.updateMany({
      where: {
        status: InvoiceStatus.PENDING,
        due_date: { lt: today },
      },
      data: { status: InvoiceStatus.OVERDUE },
    });

    return { marked_overdue: result.count };
  }

  // ─── APPLY LATE FEE ───────────────────────────
  async applyLateFee(invoiceId: string, lateFeeAmount: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, amount: true, discount: true, status: true },
    });

    if (!invoice || invoice.status === 'PAID') return;

    const newTotal =
      Number(invoice.amount) - Number(invoice.discount) + lateFeeAmount;

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        late_fee_applied: lateFeeAmount,
        total_due: newTotal,
        status: InvoiceStatus.OVERDUE,
      },
    });
  }

  // ─── AUTO-GENERATE MONTHLY INVOICES ───────────
  // Called by BullMQ invoice-generator job daily.
  // Finds all ACTIVE agreements whose collection_day = today.
  // Creates invoice for each if not already created for this billing period.
  async generateMonthlyInvoices() {
    const today = new Date();
    const todayDay = today.getDate();
    const year = today.getFullYear();
    const month = today.getMonth();

    // Billing period = current month
    const billingStart = new Date(year, month, 1);
    const billingEnd = new Date(year, month + 1, 0); // last day of month

    // Fetch all active agreements due today
    const agreements = await this.prisma.rentalAgreement.findMany({
      where: {
        status: 'ACTIVE',
        collection_day: todayDay,
      },
      select: {
        id: true,
        landlord_id: true,
        rent_amount: true,
        grace_period_days: true,
        late_fee_flat: true,
        collection_day: true,
      },
    });

    const created: string[] = [];
    const skipped: string[] = [];

    for (const agreement of agreements) {
      // Idempotency check: don't create duplicate invoice for same period
      const existing = await this.prisma.invoice.findFirst({
        where: {
          agreement_id: agreement.id,
          type: InvoiceType.RENT,
          billing_period_start: billingStart,
        },
        select: { id: true },
      });

      if (existing) {
        skipped.push(agreement.id);
        continue;
      }

      // Due date = collection_day of this month
      const dueDate = new Date(year, month, agreement.collection_day);

      const invoice = await this.prisma.invoice.create({
        data: {
          landlord_id: agreement.landlord_id,
          agreement_id: agreement.id,
          type: InvoiceType.RENT,
          status: InvoiceStatus.PENDING,
          amount: agreement.rent_amount,
          discount: 0,
          late_fee_applied: 0,
          total_due: agreement.rent_amount,
          due_date: dueDate,
          billing_period_start: billingStart,
          billing_period_end: billingEnd,
        },
      });

      created.push(invoice.id);
    }

    return {
      generated: created.length,
      skipped: skipped.length,
      invoice_ids: created,
    };
  }

  // ─── FIFO PAYMENT ALLOCATION ──────────────────
  // When a tenant pays, payment is first applied to oldest OVERDUE invoices.
  // Any excess is credited to the tenant's credit_amount balance.
  async processFifoPayment(
    tenantId: string,
    landlordId: string,
    paymentAmount: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Fetch all pending + overdue invoices for this tenant under this landlord, oldest first
      const pendingInvoices = await tx.invoice.findMany({
        where: {
          landlord_id: landlordId,
          status: { in: [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE] },
          agreement: { tenant_id: tenantId },
        },
        orderBy: { due_date: 'asc' }, // FIFO — oldest due first
      });

      let remaining = paymentAmount;

      for (const invoice of pendingInvoices) {
        if (remaining <= 0) break;

        const due = Number(invoice.total_due);

        if (remaining >= due) {
          // Fully cover this invoice
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: InvoiceStatus.PAID, total_due: 0 },
          });
          remaining -= due;
        } else {
          // Partial payment — reduce total_due
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { total_due: new Decimal(due - remaining) },
          });
          remaining = 0;
        }
      }

      // Credit any excess to tenant's account
      if (remaining > 0) {
        await tx.user.update({
          where: { id: tenantId },
          data: { credit_amount: { increment: remaining } },
        });
      }

      return { applied: paymentAmount - remaining, credited: remaining };
    });
  }
}
