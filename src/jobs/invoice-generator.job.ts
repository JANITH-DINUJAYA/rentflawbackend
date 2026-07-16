import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Daily cron job that runs at 01:00 AM server time.
 * Enqueues a job into the BullMQ 'invoice-generator' queue.
 */
@Injectable()
export class InvoiceGeneratorJob {
  private readonly logger = new Logger(InvoiceGeneratorJob.name);

  constructor(
    @InjectQueue('invoice-generator') private readonly invoiceQueue: Queue,
  ) {}

  @Cron('0 1 * * *') // Every day at 01:00 AM
  async handleInvoiceGeneration() {
    this.logger.log('Enqueueing daily invoice generation job...');
    try {
      const job = await this.invoiceQueue.add('generate-invoices', {
        triggeredAt: new Date().toISOString(),
      });
      this.logger.log(`Enqueued invoice generator job with ID: ${job.id}`);
    } catch (error) {
      this.logger.error('Failed to enqueue invoice generator job', error);
    }
  }
}
