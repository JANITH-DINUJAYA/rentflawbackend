import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InvoiceGeneratorJob } from './invoice-generator.job';
import { OverdueDetectionJob } from './overdue-detection.job';
import { ReminderJob } from './reminder.job';
import { InvoiceGeneratorProcessor } from './processors/invoice-generator.processor';
import { OverdueDetectionProcessor } from './processors/overdue-detection.processor';
import { ReminderProcessor } from './processors/reminder.processor';
import { InvoicesModule } from '../modules/invoices/invoices.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    BullModule.registerQueue(
      { name: 'invoice-generator' },
      { name: 'overdue-detection' },
      { name: 'reminders' },
    ),
    InvoicesModule,
    NotificationsModule,
  ],
  providers: [
    InvoiceGeneratorJob,
    OverdueDetectionJob,
    ReminderJob,
    InvoiceGeneratorProcessor,
    OverdueDetectionProcessor,
    ReminderProcessor,
  ],
  exports: [
    InvoiceGeneratorJob,
    OverdueDetectionJob,
    ReminderJob,
    InvoiceGeneratorProcessor,
    OverdueDetectionProcessor,
    ReminderProcessor,
  ],
})
export class JobsModule {}
