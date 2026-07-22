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
import * as crypto from 'crypto';

import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private notifications: NotificationsService,
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
    // Verify tenant has an active agreement
    const activeLease = await this.prisma.rentalAgreement.findFirst({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
      include: {
        landlord: {
          include: {
            user: { select: { id: true, email: true } }
          }
        },
        tenant: { select: { first_name: true, last_name: true } },
        property: { select: { name: true } },
        room: { select: { room_number: true } }
      }
    });
    if (!activeLease) {
      throw new ForbiddenException('You must have an active lease agreement to submit payments.');
    }

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

    const submissionResult = existingPending
      ? await this.prisma.paymentSubmission.update({
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
        })
      : await this.prisma.paymentSubmission.create({
          data: {
            invoice_id: dto.invoice_id,
            tenant_id: tenantId,
            amount_paid: dto.amount_paid,
            payment_date: dto.payment_date,
            receipt_url: dto.receipt_url,
          },
        });

    // Send notifications to landlord
    const tenantName = `${activeLease.tenant.first_name} ${activeLease.tenant.last_name}`;
    const propName = `${activeLease.property.name} (Room ${activeLease.room.room_number})`;

    // 1. In-app notification
    await this.notifications.createNotification(
      activeLease.landlord.user.id,
      'New Payment Submission',
      `${tenantName} submitted a payment receipt of Rs ${dto.amount_paid.toFixed(2)} for ${propName}.`,
    );

    // 2. Email notification
    await this.notifications.sendPaymentSubmitted(
      activeLease.landlord.user.email,
      tenantName,
      dto.amount_paid,
      propName,
    );

    return submissionResult;
  }

  // ─── APPROVE PAYMENT ──────────────────────────
  // Uses SELECT FOR UPDATE to prevent concurrent double-approval.
  // After approval: triggers FIFO payment allocation on the invoice chain.
  async approvePayment(
    submissionId: string,
    reviewerId: string,
    landlordId: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
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

      // Load tenant details for notification
      const tenant = await tx.user.findUnique({
        where: { id: submission.tenant_id },
        select: { email: true, first_name: true, last_name: true },
      });

      // Load landlord and staff details for notification
      const landlord = await tx.landlord.findUnique({
        where: { id: landlordId },
        select: {
          user_id: true,
          staff_profiles: { select: { user_id: true } }
        }
      });

      return { submission, tenant, landlord };
    });

    // Send notifications outside transaction
    if (result.tenant) {
      const tenantName = `${result.tenant.first_name} ${result.tenant.last_name}`;
      const amountStr = Number(result.submission.amount_paid).toFixed(2);

      // 1. Notify Tenant (In-app + Email)
      await this.notifications.createNotification(
        result.submission.tenant_id,
        'Payment Approved',
        `Your payment submission of Rs ${amountStr} has been approved.`,
      );
      await this.notifications.sendPaymentApproved(
        result.tenant.email,
        tenantName,
        Number(result.submission.amount_paid),
        result.submission.invoice_id.slice(0, 8),
      );

      // 2. Notify Landlord & Staff (In-app)
      if (result.landlord) {
        const notifyUserIds = new Set<string>();
        notifyUserIds.add(result.landlord.user_id);
        result.landlord.staff_profiles.forEach(s => notifyUserIds.add(s.user_id));

        for (const uid of notifyUserIds) {
          await this.notifications.createNotification(
            uid,
            'Payment Approved',
            `Payment of Rs ${amountStr} from ${tenantName} has been approved.`,
          );
        }
      }
    }

    return { message: 'Payment approved successfully', submission_id: submissionId };
  }

  // ─── REJECT PAYMENT ───────────────────────────
  async rejectPayment(
    submissionId: string,
    reviewerId: string,
    notes: string,
  ) {
    const submission = await this.prisma.paymentSubmission.findFirst({
      where: { id: submissionId, status: 'PENDING_REVIEW', is_locked: false },
      select: {
        id: true,
        tenant_id: true,
        amount_paid: true,
        invoice_id: true,
        invoice: {
          select: {
            landlord: {
              select: {
                user_id: true,
                staff_profiles: { select: { user_id: true } }
              }
            }
          }
        }
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found or already processed');
    }

    const updated = await this.prisma.paymentSubmission.update({
      where: { id: submissionId },
      data: {
        status: PaymentSubmissionStatus.REJECTED,
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
        notes,
      },
    });

    // Load tenant details for notification
    const tenant = await this.prisma.user.findUnique({
      where: { id: submission.tenant_id },
      select: { email: true, first_name: true, last_name: true },
    });

    if (tenant) {
      const tenantName = `${tenant.first_name} ${tenant.last_name}`;
      const amountStr = Number(submission.amount_paid).toFixed(2);

      // 1. Notify Tenant (In-app + Email)
      await this.notifications.createNotification(
        submission.tenant_id,
        'Payment Rejected',
        `Your payment submission of Rs ${amountStr} was rejected. Reason: ${notes}`,
      );
      await this.notifications.sendPaymentRejected(
        tenant.email,
        tenantName,
        notes,
        submission.invoice_id.slice(0, 8),
      );

      // 2. Notify Landlord & Staff (In-app)
      if (submission.invoice?.landlord) {
        const notifyUserIds = new Set<string>();
        notifyUserIds.add(submission.invoice.landlord.user_id);
        submission.invoice.landlord.staff_profiles.forEach(s => notifyUserIds.add(s.user_id));

        for (const uid of notifyUserIds) {
          await this.notifications.createNotification(
            uid,
            'Payment Rejected',
            `Payment of Rs ${amountStr} from ${tenantName} was rejected.`,
          );
        }
      }
    }

    return updated;
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
  // ─── GET PAYHERE PARAMS ─────────────────────────
  async getPayHereParams(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        status: { in: ['PENDING', 'OVERDUE'] },
        agreement: { tenant_id: tenantId },
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

    if (!invoice) {
      throw new NotFoundException('Invoice not found or eligible for payment');
    }

    const merchantId = process.env.PAYHERE_MERCHANT_ID || '1226786';
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || '8MTEyMjgxMTI3MjMzODMwNDAzNTMxMTk4OTExMzYyMzMxMzgx';
    const currency = 'LKR';

    const amountFormatted = Number(invoice.total_due).toFixed(2);
    const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const rawString = merchantId + invoiceId + amountFormatted + currency + secretHash;
    const hash = crypto.createHash('md5').update(rawString).digest('hex').toUpperCase();

    const tenant = invoice.agreement.tenant;
    const property = invoice.agreement.property;

    return {
      sandbox: true,
      merchant_id: merchantId,
      return_url: `${process.env.FRONTEND_URL || 'https://rentflaw.vercel.app'}/tenant/invoices?status=success`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://rentflaw.vercel.app'}/tenant/invoices?status=cancelled`,
      notify_url: `${process.env.BACKEND_URL || 'https://rentflawbackend-production.up.railway.app/api'}/payments/payhere/notify`,
      order_id: invoiceId,
      items: `${invoice.type} Invoice - ${property.name}`,
      amount: amountFormatted,
      currency,
      hash,
      first_name: tenant.first_name,
      last_name: tenant.last_name,
      email: tenant.email,
      phone: tenant.phone || '0771234567',
      address: property.address,
      city: 'Colombo',
      country: 'Sri Lanka',
    };
  }

  // ─── GET PAYHERE PARAMS FOR SUBSCRIPTION ─────────
  async getPayHereSubscriptionParams(landlordId: string, packageId: string) {
    const landlord = await this.prisma.landlord.findFirst({
      where: { id: landlordId },
      include: { user: true },
    });

    if (!landlord) throw new NotFoundException('Landlord profile not found');

    const pkg = await this.prisma.subscriptionPackage.findUnique({
      where: { id: packageId },
    });

    if (!pkg) throw new NotFoundException('Subscription package not found');
    if (Number(pkg.price) === 0) throw new BadRequestException('Free plans do not require payment');

    const merchantId = process.env.PAYHERE_MERCHANT_ID || '1226786';
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || '8MTEyMjgxMTI3MjMzODMwNDAzNTMxMTk4OTExMzYyMzMxMzgx';
    const currency = 'LKR';
    const orderId = `SUB-${landlordId}-${packageId}-${Date.now()}`;
    const amountFormatted = Number(pkg.price).toFixed(2);

    const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const rawString = merchantId + orderId + amountFormatted + currency + secretHash;
    const hash = crypto.createHash('md5').update(rawString).digest('hex').toUpperCase();

    return {
      sandbox: true,
      merchant_id: merchantId,
      return_url: `${process.env.FRONTEND_URL || 'https://rentflaw.vercel.app'}/landlord/subscriptions?status=success`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://rentflaw.vercel.app'}/landlord/subscriptions?status=cancelled`,
      notify_url: `${process.env.BACKEND_URL || 'https://rentflawbackend-production.up.railway.app/api'}/payments/payhere/subscription-notify`,
      order_id: orderId,
      items: `RentFlaw ${pkg.name} Subscription`,
      amount: amountFormatted,
      currency,
      hash,
      first_name: landlord.user.first_name,
      last_name: landlord.user.last_name,
      email: landlord.user.email,
      phone: landlord.user.phone || '0771234567',
      address: landlord.company_name || 'RentFlaw Platform',
      city: 'Colombo',
      country: 'Sri Lanka',
    };
  }

  // ─── PROCESS WEBHOOK CALLBACK ────────────────────
  async processPayHereWebhook(payload: any) {
    const merchantId = payload.merchant_id;
    const orderId = payload.order_id;
    const payhereAmount = payload.payhere_amount;
    const payhereCurrency = payload.payhere_currency;
    const statusCode = payload.status_code;
    const md5sig = payload.md5sig;
    const paymentId = payload.payment_id;

    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || '8MTEyMjgxMTI3MjMzODMwNDAzNTMxMTk4OTExMzYyMzMxMzgx';
    const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const rawString = merchantId + orderId + payhereAmount + payhereCurrency + statusCode + secretHash;
    const localMd5Sig = crypto.createHash('md5').update(rawString).digest('hex').toUpperCase();

    if (localMd5Sig !== md5sig) {
      throw new BadRequestException('Invalid signature verification');
    }

    if (statusCode === '2') {
      await this.confirmDirectPayment(orderId, Number(payhereAmount), `PayHere Sandbox ID: ${paymentId}`);
    }

    return { status: 'success' };
  }

  // ─── LOCAL BYPASS PAYMENT ────────────────────────
  async processLocalBypassPayment(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        status: { in: ['PENDING', 'OVERDUE'] },
        agreement: { tenant_id: tenantId },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found or eligible for payment');
    }

    return this.confirmDirectPayment(invoiceId, Number(invoice.total_due), 'PayHere Sandbox Local Bypass Settle');
  }

  // ─── CONFIRM DIRECT PAYMENT ──────────────────────
  async confirmDirectPayment(invoiceId: string, amountPaid: number, notes: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { agreement: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID') return { message: 'Invoice already paid' };

    const tenantId = invoice.agreement.tenant_id;

    const existing = await this.prisma.paymentSubmission.findFirst({
      where: { 
        invoice_id: invoiceId,
        status: { in: [PaymentSubmissionStatus.PENDING_REVIEW, PaymentSubmissionStatus.APPROVED] }
      },
    });

    if (existing) {
      throw new BadRequestException('A payment submission already exists for this invoice.');
    }

    const submission = await this.prisma.paymentSubmission.create({
      data: {
        invoice_id: invoiceId,
        tenant_id: tenantId,
        amount_paid: amountPaid,
        payment_date: new Date(),
        status: PaymentSubmissionStatus.PENDING_REVIEW,
        is_locked: false,
        receipt_url: 'https://sandbox.payhere.lk',
        notes,
      },
    });

    return { status: 'PENDING_REVIEW', submission_id: submission.id };
  }
}
