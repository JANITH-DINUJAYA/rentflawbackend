import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Overdue Detection Job
 *
 * Runs daily at 02:00 AM.
 * Enqueues a job into the BullMQ 'overdue-detection' queue.
 */
@Injectable()
export class OverdueDetectionJob {
  private readonly logger = new Logger(OverdueDetectionJob.name);

  constructor(
    @InjectQueue('overdue-detection') private readonly overdueQueue: Queue,
  ) {}

  @Cron('0 2 * * *') // Every day at 02:00 AM
  async handleOverdueDetection() {
    this.logger.log('Enqueueing daily overdue detection job...');
    try {
      const job = await this.overdueQueue.add('detect-overdue', {
        triggeredAt: new Date().toISOString(),
      });
      this.logger.log(`Enqueued overdue detection job with ID: ${job.id}`);
    } catch (error) {
      this.logger.error('Failed to enqueue overdue detection job', error);
    }
  }
}
