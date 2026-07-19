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
          from: process.env.EMAIL_FROM || 'RentFlaw <noreply@rentflaw.com>',
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
}
