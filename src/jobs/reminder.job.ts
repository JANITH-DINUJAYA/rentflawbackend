import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Reminder Job
 *
 * Runs daily at 09:00 AM.
 * Enqueues a job into the BullMQ 'reminders' queue.
 */
@Injectable()
export class ReminderJob {
  private readonly logger = new Logger(ReminderJob.name);

  constructor(
    @InjectQueue('reminders') private readonly remindersQueue: Queue,
  ) {}

  @Cron('0 9 * * *') // Every day at 09:00 AM
  async handleReminders() {
    this.logger.log('Enqueueing daily rent reminders job...');
    try {
      const job = await this.remindersQueue.add('send-reminders', {
        triggeredAt: new Date().toISOString(),
      });
      this.logger.log(`Enqueued rent reminders job with ID: ${job.id}`);
    } catch (error) {
      this.logger.error('Failed to enqueue rent reminders job', error);
    }
  }
}
