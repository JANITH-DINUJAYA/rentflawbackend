import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SystemService } from '../system/system.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemService: SystemService,
  ) {}

  // ─── IN-APP DATABASE NOTIFICATIONS ───────────────────────────

  async createNotification(userId: string, title: string, message: string) {
    try {
      return await this.prisma.notification.create({
        data: { user_id: userId, title, message },
      });
    } catch (e) {
      this.logger.error(`Failed to create database notification for user ${userId}`, e);
    }
  }

  async getNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, user_id: userId },
      data: { is_read: true },
    });
  }

  async clearAll(userId: string) {
    return this.prisma.notification.deleteMany({
      where: { user_id: userId },
    });
  }

  // ─── PRIVATE EMAIL HELPERS ───────────────────────────

  private async sendGenericEmail(to: string, subject: string, html: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY not set. Email skipped → to: ${to}, subject: ${subject}`);
      return;
    }
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          // onboarding@resend.dev works without domain verification (Resend sandbox).
          // Set EMAIL_FROM in Railway env vars once you verify your domain on resend.com/domains
          from: process.env.EMAIL_FROM || 'RentFlaw <onboarding@resend.dev>',
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`Resend API error: ${err}`);
        this.systemService.addLog('ERROR', 'ResendGateway', `Failed email to ${to}: ${err}`);
      } else {
        this.logger.log(`Email sent to ${to}: ${subject}`);
        this.systemService.addLog('INFO', 'ResendGateway', `Email sent to ${to} — "${subject}"`);
      }
    } catch (e) {
      this.logger.error('Failed to dispatch email via Resend', e);
      this.systemService.addLog('ERROR', 'ResendGateway', `Dispatch exception for ${to}: ${e}`);
    }
  }

  // ─── EMAIL TEMPLATES ───────────────────────────

  async sendRentReminder(to: string, name: string, dueDate: Date, amount: number, propertyName: string) {
    await this.sendGenericEmail(
      to,
      `Rent Reminder: ${propertyName}`,
      `<p>Hello <strong>${name}</strong>,</p>
       <p>This is a reminder that your rent of <strong>$${amount}</strong> for <strong>${propertyName}</strong> is due on <strong>${dueDate.toDateString()}</strong>.</p>
       <p>Please log in to <a href="${process.env.APP_URL || 'https://rentflaw.vercel.app'}">RentFlaw</a> to settle your invoice.</p>
       <p>Thank you!</p>`,
    );
  }

  async sendPaymentApproved(to: string, name: string, amount: number, invoiceRef: string): Promise<void> {
    await this.sendGenericEmail(
      to,
      'Payment Approved — RentFlaw',
      `<p>Hello <strong>${name}</strong>,</p>
       <p>Your payment of <strong>$${amount}</strong> (ref: ${invoiceRef}) has been <strong>approved</strong> by your landlord.</p>
       <p>Your invoice has been marked as <strong>PAID</strong>. Thank you!</p>
       <p><a href="${process.env.APP_URL || 'https://rentflaw.vercel.app'}/tenant/invoices">View your invoices</a></p>`,
    );
  }

  async sendPaymentRejected(to: string, name: string, reason: string, invoiceRef: string): Promise<void> {
    await this.sendGenericEmail(
      to,
      'Payment Rejected — RentFlaw',
      `<p>Hello <strong>${name}</strong>,</p>
       <p>Unfortunately your payment submission (ref: ${invoiceRef}) was <strong>rejected</strong>.</p>
       <p><strong>Reason:</strong> ${reason || 'No specific reason provided.'}</p>
       <p>Please resubmit with a valid proof of payment. <a href="${process.env.APP_URL || 'https://rentflaw.vercel.app'}/tenant/payments/submit">Submit again</a></p>`,
    );
  }

  async sendAgreementActivated(to: string, name: string, propertyName: string, startDate: Date): Promise<void> {
    await this.sendGenericEmail(
      to,
      'Rental Agreement Activated — RentFlaw',
      `<p>Hello <strong>${name}</strong>,</p>
       <p>Your rental agreement for <strong>${propertyName}</strong> has been activated starting <strong>${startDate.toDateString()}</strong>.</p>
       <p>Invoices will be generated on your scheduled billing dates. <a href="${process.env.APP_URL || 'https://rentflaw.vercel.app'}/tenant/agreement">View your agreement</a></p>
       <p>Welcome aboard!</p>`,
    );
  }

  async sendLeaveRequestReceived(to: string, tenantName: string, landlordEmail: string, exitDate: Date): Promise<void> {
    await this.sendGenericEmail(
      to,
      'Leave Request Received — RentFlaw',
      `<p>Hi there,</p>
       <p>Tenant <strong>${tenantName}</strong> has submitted a request to terminate their agreement with an exit date of <strong>${exitDate.toDateString()}</strong>.</p>
       <p>Please log in to your landlord dashboard to review and approve this request.</p>`,
    );
  }

  async sendAdminTestEmail(to: string): Promise<void> {
    await this.sendGenericEmail(
      to,
      'RentFlaw Email Gateway Test',
      `<p>This is a test email from the <strong>RentFlaw Platform Admin</strong>.</p>
       <p>If you received this email, your Resend email gateway is configured correctly.</p>
       <p>Timestamp: ${new Date().toISOString()}</p>`,
    );
  }

  async sendDepositRefundPaid(to: string, name: string, amount: number, propertyName: string): Promise<void> {
    await this.sendGenericEmail(
      to,
      'Security Deposit Refund Paid — RentFlaw',
      `<p>Hello <strong>${name}</strong>,</p>
       <p>Your landlord has processed and paid your security deposit refund of <strong>$${amount.toFixed(2)}</strong> for <strong>${propertyName}</strong>.</p>
       <p>Please check your bank account or contact your landlord for payment references.</p>
       <p>Thank you for using RentFlaw!</p>`,
    );
  }

  async sendCreditPayoutPaid(to: string, name: string, amount: number): Promise<void> {
    await this.sendGenericEmail(
      to,
      'Overpaid Credit Refund Paid — RentFlaw',
      `<p>Hello <strong>${name}</strong>,</p>
       <p>Your landlord has processed and settled your overpaid credit balance of <strong>$${amount.toFixed(2)}</strong>.</p>
       <p>Please check your bank account or contact your landlord for payment references.</p>
       <p>Thank you!</p>`,
    );
  }

  async sendPasswordResetEmail(to: string, name: string, tempPassword: string): Promise<void> {
    await this.sendGenericEmail(
      to,
      'Password Reset — RentFlaw',
      `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: auto; padding: 40px 20px; background: #f9fafb; border-radius: 12px;">
        <div style="background: white; border-radius: 10px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
          <h1 style="color: #4f46e5; font-size: 24px; margin-top: 0;">🔑 Password Reset</h1>
          <p style="color: #374151;">Hello <strong>${name}</strong>,</p>
          <p style="color: #374151;">We received a password reset request for your RentFlaw account. Here is your temporary password:</p>
          <div style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 24px; text-align: center; margin: 20px 0;">
            <span style="font-size: 22px; font-weight: 900; font-family: monospace; color: #111827; letter-spacing: 4px;">${tempPassword}</span>
          </div>
          <p style="color: #374151;">Please log in with this temporary password and <strong>change it immediately</strong> in your profile settings.</p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">If you did not request a password reset, please ignore this email. Your account remains secure.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">RentFlaw — Global Rental Management SaaS</p>
        </div>
      </div>
      `,
    );
  }
}
