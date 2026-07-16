import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InvoicesService } from '../../modules/invoices/invoices.service';
import { Logger } from '@nestjs/common';

@Processor('invoice-generator')
export class InvoiceGeneratorProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceGeneratorProcessor.name);

  constructor(private invoicesService: InvoicesService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing invoice generator job ${job.id}...`);
    try {
      const result = await this.invoicesService.generateMonthlyInvoices();
      this.logger.log(
        `Invoice generation complete: ${result.generated} created, ${result.skipped} skipped`,
      );
      return result;
    } catch (error) {
      this.logger.error('Invoice generator job execution failed', error);
      throw error;
    }
  }
}
