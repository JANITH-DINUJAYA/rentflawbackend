import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── IN-APP DATABASE NOTIFICATIONS ───────────────────────────

  async createNotification(userId: string, title: string, message: string) {
    try {
      return await this.prisma.notification.create({
        data: {
          user_id: userId,
          title,
          message,
        },
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

  // ─── EMAIL NOTIFICATIONS (RESEND) ───────────────────────────

  async sendRentReminder(to: string, name: string, dueDate: Date, amount: number, propertyName: string) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not defined. Email skipped (logged below):');
      this.logger.log(`Email to: ${to}, subject: Rent Reminder for ${propertyName}, amount: $${amount}, due: ${dueDate.toDateString()}`);
      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'RentFlaw <noreply@rentflaw.com>',
          to: [to],
          subject: `Rent Reminder: ${propertyName}`,
          html: `<p>Hello ${name},</p><p>This is a reminder that rent of <strong>$${amount}</strong> for <strong>${propertyName}</strong> is due on <strong>${dueDate.toDateString()}</strong>.</p><p>Thank you!</p>`,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`Resend API returned error: ${err}`);
      } else {
        this.logger.log(`Rent reminder sent to ${to} for property ${propertyName}`);
      }
    } catch (e) {
      this.logger.error('Failed to dispatch email via Resend', e);
    }
  }
}
