import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaymentSubmissionStatus } from '@prisma/client';
import { InvoicesService } from '../invoices/invoices.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
  ) {}

  // ─── SUBMIT PAYMENT PROOF ─────────────────────
  // Tenants upload a receipt for a specific invoice.
  // Only allowed when invoice is PENDING or OVERDUE.
  // If a submission already exists and is NOT approved, it can be replaced.
  async submitPayment(
    tenantId: string,
    dto: {
      invoice_id: string;
      amount_paid: number;
      payment_date: Date;
      receipt_url: string;
    },
  ) {
    // Verify invoice belongs to this tenant
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: dto.invoice_id,
        status: { in: ['PENDING', 'OVERDUE'] },
        agreement: { tenant_id: tenantId },
      },
      select: { id: true, status: true },
    });

    if (!invoice) {
      throw new NotFoundException(
        'Invoice not found or is not eligible for payment submission',
      );
    }

    // Check for existing locked (approved) submission — cannot re-submit
    const existingApproved = await this.prisma.paymentSubmission.findFirst({
      where: { invoice_id: dto.invoice_id, is_locked: true },
      select: { id: true },
    });

    if (existingApproved) {
      throw new ConflictException(
        'A payment for this invoice has already been approved and locked',
      );
    }

    // Replace any existing PENDING_REVIEW or REJECTED submission (re-upload flow)
    const existingPending = await this.prisma.paymentSubmission.findFirst({
      where: {
        invoice_id: dto.invoice_id,
        tenant_id: tenantId,
        status: { in: ['PENDING_REVIEW', 'REJECTED'] },
        is_locked: false,
      },
      select: { id: true },
    });

    if (existingPending) {
      // Update the existing submission instead of creating a new one
      return this.prisma.paymentSubmission.update({
        where: { id: existingPending.id },
        data: {
          amount_paid: dto.amount_paid,
          payment_date: dto.payment_date,
          receipt_url: dto.receipt_url,
          status: PaymentSubmissionStatus.PENDING_REVIEW,
          notes: null,
          reviewed_by: null,
          reviewed_at: null,
        },
      });
    }

    return this.prisma.paymentSubmission.create({
      data: {
        invoice_id: dto.invoice_id,
        tenant_id: tenantId,
        amount_paid: dto.amount_paid,
        payment_date: dto.payment_date,
        receipt_url: dto.receipt_url,
      },
    });
  }

  // ─── APPROVE PAYMENT ──────────────────────────
  // Uses SELECT FOR UPDATE to prevent concurrent double-approval.
  // After approval: triggers FIFO payment allocation on the invoice chain.
  async approvePayment(
    submissionId: string,
    reviewerId: string,
    landlordId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the row to prevent concurrent approvals
      const rows: any[] = await tx.$queryRaw`
        SELECT id, status, is_locked, invoice_id, tenant_id, amount_paid
        FROM payment_submissions
        WHERE id = ${submissionId}
        FOR UPDATE
      `;

      const submission = rows[0];
      if (!submission) throw new NotFoundException('Payment submission not found');

      // Guard: already approved or locked
      if (submission.status === 'APPROVED' || submission.is_locked) {
        throw new ConflictException(
          'This payment has already been processed. Only one approval is permitted.',
        );
      }

      if (submission.status === 'REJECTED') {
        throw new BadRequestException(
          'Cannot approve a rejected submission. Ask tenant to re-upload receipt.',
        );
      }

      // Lock and approve submission
      await tx.paymentSubmission.update({
        where: { id: submissionId },
        data: {
          status: PaymentSubmissionStatus.APPROVED,
          is_locked: true,
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
        },
      });

      // Apply FIFO payment allocation using the amount paid
      await this.invoicesService.processFifoPayment(
        submission.tenant_id,
        landlordId,
        Number(submission.amount_paid),
      );

      return { message: 'Payment approved successfully', submission_id: submissionId };
    });
  }

  // ─── REJECT PAYMENT ───────────────────────────
  async rejectPayment(
    submissionId: string,
    reviewerId: string,
    notes: string,
  ) {
    const submission = await this.prisma.paymentSubmission.findFirst({
      where: { id: submissionId, status: 'PENDING_REVIEW', is_locked: false },
      select: { id: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found or already processed');
    }

    return this.prisma.paymentSubmission.update({
      where: { id: submissionId },
      data: {
        status: PaymentSubmissionStatus.REJECTED,
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
        notes,
      },
    });
  }

  // ─── GET ALL SUBMISSIONS (Landlord) ──────────
  async findAllForLandlord(
    landlordId: string,
    filters: { status?: PaymentSubmissionStatus; page?: number; limit?: number },
  ) {
    const { status, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {
      invoice: { landlord_id: landlordId },
    };
    if (status) where.status = status;

    const [submissions, total] = await this.prisma.$transaction([
      this.prisma.paymentSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          tenant: { select: { first_name: true, last_name: true, email: true } },
          invoice: {
            select: {
              id: true,
              type: true,
              total_due: true,
              due_date: true,
              agreement: {
                select: {
                  property: { select: { name: true } },
                  room: { select: { room_number: true } },
                },
              },
            },
          },
          reviewer: { select: { first_name: true, last_name: true } },
        },
      }),
      this.prisma.paymentSubmission.count({ where }),
    ]);

    return { submissions, total, page, limit };
  }

  // ─── GET TENANT'S SUBMISSIONS ────────────────
  async findTenantSubmissions(tenantId: string) {
    return this.prisma.paymentSubmission.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      include: {
        invoice: {
          select: {
            type: true,
            total_due: true,
            due_date: true,
            billing_period_start: true,
            billing_period_end: true,
          },
        },
        reviewer: { select: { first_name: true, last_name: true } },
      },
    });
  }
}
