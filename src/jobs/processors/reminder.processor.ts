import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { Logger } from '@nestjs/common';

@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing rent reminder job ${job.id}...`);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const remindDays = [2, 1, 0]; // 2 days before, 1 day before, on due date
      let totalSent = 0;

      for (const daysAhead of remindDays) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + daysAhead);

        const dueInvoices = await this.prisma.invoice.findMany({
          where: {
            status: 'PENDING',
            due_date: {
              gte: targetDate,
              lt: new Date(targetDate.getTime() + 86_400_000), // 1-day window
            },
          },
          select: {
            id: true,
            total_due: true,
            due_date: true,
            agreement: {
              select: {
                tenant: { select: { email: true, first_name: true } },
                property: { select: { name: true } },
              },
            },
          },
        });

        for (const invoice of dueInvoices) {
          const { email, first_name } = invoice.agreement.tenant;
          const propertyName = invoice.agreement.property.name;

          const daysLabel =
            daysAhead === 0 ? 'today' : `in ${daysAhead} day${daysAhead > 1 ? 's' : ''}`;

          this.logger.log(
            `[REMINDER] Sending email to ${email} for rent of Rs ${invoice.total_due} due ${daysLabel}`,
          );

          await this.notificationsService.sendRentReminder(
            email,
            first_name,
            invoice.due_date,
            Number(invoice.total_due),
            propertyName,
          );

          totalSent++;
        }
      }

      this.logger.log(`Sent ${totalSent} rent reminder notifications`);
      return { totalSent };
    } catch (error) {
      this.logger.error('Rent reminder job execution failed', error);
      throw error;
    }
  }
}
