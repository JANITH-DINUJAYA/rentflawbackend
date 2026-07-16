import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { InvoicesService } from '../../modules/invoices/invoices.service';
import { Logger } from '@nestjs/common';

@Processor('overdue-detection')
export class OverdueDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(OverdueDetectionProcessor.name);

  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing overdue detection job ${job.id}...`);

    try {
      // Step 1: Mark pending invoices past due as OVERDUE
      const overdueResult = await this.invoicesService.markOverdueInvoices();
      this.logger.log(`Marked ${overdueResult.marked_overdue} invoices as OVERDUE`);

      // Step 2: Apply late fees
      await this.applyLateFees();

      // Step 3: Mark expired agreements
      await this.markExpiredAgreements();

      return { success: true };
    } catch (error) {
      this.logger.error('Overdue detection job execution failed', error);
      throw error;
    }
  }

  private async applyLateFees() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: 'OVERDUE',
        late_fee_applied: 0,
        type: 'RENT',
      },
      select: {
        id: true,
        agreement: {
          select: { late_fee_flat: true, grace_period_days: true },
        },
      },
    });

    let feeCount = 0;
    for (const invoice of overdueInvoices) {
      const lateFee = Number(invoice.agreement.late_fee_flat);
      if (lateFee > 0) {
        await this.invoicesService.applyLateFee(invoice.id, lateFee);
        feeCount++;
      }
    }

    this.logger.log(`Applied late fees to ${feeCount} invoices`);
  }

  private async markExpiredAgreements() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.prisma.rentalAgreement.updateMany({
      where: {
        status: 'ACTIVE',
        end_date: { lt: today },
      },
      data: { status: 'EXPIRED' },
    });

    this.logger.log(`Marked ${result.count} agreements as EXPIRED`);
  }
}
