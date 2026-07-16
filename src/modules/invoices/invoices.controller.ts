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
import { InvoicesService } from './invoices.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole, InvoiceStatus, InvoiceType } from '@prisma/client';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @ApiOperation({ summary: 'List all invoices for landlord' })
  @Get('landlord')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  findAll(
    @CurrentUser() user: any,
    @Query('status') status?: InvoiceStatus,
    @Query('agreementId') agreementId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.invoicesService.findAll(landlordId, { status, agreementId, page, limit });
  }

  @ApiOperation({ summary: 'List all invoices for tenant' })
  @Get('tenant')
  @Roles(GlobalRole.TENANT)
  findTenantInvoices(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.invoicesService.findTenantInvoices(user.id, page, limit);
  }

  @ApiOperation({ summary: 'Get single invoice details' })
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.invoicesService.findOne(landlordId, id);
  }

  @ApiOperation({ summary: 'Create a manual damage or utility invoice' })
  @Post()
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  createManual(
    @CurrentUser() user: any,
    @Body()
    dto: {
      agreement_id: string;
      type: InvoiceType;
      amount: number;
      discount?: number;
      due_date: Date;
      billing_period_start: Date;
      billing_period_end: Date;
    },
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.invoicesService.createManual(landlordId, dto);
  }

  @ApiOperation({ summary: 'Apply discount to a pending invoice' })
  @Patch(':id/discount')
  @Roles(GlobalRole.LANDLORD)
  applyDiscount(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { discount: number },
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.invoicesService.applyDiscount(landlordId, id, dto.discount);
  }
}
