import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole, PaymentSubmissionStatus } from '@prisma/client';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @ApiOperation({ summary: 'Submit payment proof (receipt) — Tenant only' })
  @Post('submit')
  @Roles(GlobalRole.TENANT)
  submitPayment(
    @CurrentUser() user: any,
    @Body()
    dto: {
      invoice_id: string;
      amount_paid: number;
      payment_date: Date;
      receipt_url: string;
    },
  ) {
    return this.paymentsService.submitPayment(user.id, dto);
  }

  @ApiOperation({ summary: 'List all payment submissions for landlord' })
  @Get('landlord')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  findAllForLandlord(
    @CurrentUser() user: any,
    @Query('status') status?: PaymentSubmissionStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.paymentsService.findAllForLandlord(landlordId, { status, page, limit });
  }

  @ApiOperation({ summary: 'List all payment submissions for tenant' })
  @Get('tenant')
  @Roles(GlobalRole.TENANT)
  findTenantSubmissions(@CurrentUser() user: any) {
    return this.paymentsService.findTenantSubmissions(user.id);
  }

  @ApiOperation({ summary: 'Approve payment submission — Landlord/Staff only' })
  @Patch(':id/approve')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  approvePayment(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.paymentsService.approvePayment(id, user.id, landlordId);
  }

  @ApiOperation({ summary: 'Reject payment submission — Landlord/Staff only' })
  @Patch(':id/reject')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  rejectPayment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { notes: string },
  ) {
    return this.paymentsService.rejectPayment(id, user.id, dto.notes);
  }
}
