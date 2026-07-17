import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PayhereController } from './payhere.controller';
import { PaymentsService } from './payments.service';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [InvoicesModule],
  controllers: [PaymentsController, PayhereController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
