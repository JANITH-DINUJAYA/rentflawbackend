import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UtilityType } from '@prisma/client';

export interface CreateUtilityBillDto {
  invoice_id: string;
  type: UtilityType;
  meter_reading_previous?: number;
  meter_reading_current?: number;
  rate_per_unit?: number;
  amount?: number;
}

@Injectable()
export class UtilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async createUtilityBill(landlordId: string, dto: CreateUtilityBillDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: dto.invoice_id,
        landlord_id: landlordId,
      },
    });
    if (!invoice) throw new ForbiddenException('Invoice not found or access denied');

    let amount = dto.amount ?? 0;

    if (
      dto.meter_reading_previous !== undefined &&
      dto.meter_reading_current !== undefined &&
      dto.rate_per_unit !== undefined
    ) {
      const units = dto.meter_reading_current - dto.meter_reading_previous;
      amount = units * dto.rate_per_unit;
    }

    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.utilityBill.create({
        data: {
          landlord_id: landlordId,
          invoice_id: dto.invoice_id,
          type: dto.type,
          meter_reading_previous: dto.meter_reading_previous ?? null,
          meter_reading_current: dto.meter_reading_current ?? null,
          rate_per_unit: dto.rate_per_unit ?? null,
          amount,
        },
      });

      // Update associated invoice amount and total_due (amount - discount + late_fee)
      await tx.invoice.update({
        where: { id: dto.invoice_id },
        data: {
          amount: amount,
          total_due: amount - Number(invoice.discount) + Number(invoice.late_fee_applied),
        },
      });

      return bill;
    });
  }

  async findAll(landlordId: string) {
    return this.prisma.utilityBill.findMany({
      where: { landlord_id: landlordId },
      include: { invoice: true },
    });
  }

  async findOne(id: string, landlordId: string) {
    const bill = await this.prisma.utilityBill.findFirst({
      where: { id, landlord_id: landlordId },
      include: { invoice: true },
    });
    if (!bill) throw new NotFoundException('Utility bill not found');
    return bill;
  }
}
