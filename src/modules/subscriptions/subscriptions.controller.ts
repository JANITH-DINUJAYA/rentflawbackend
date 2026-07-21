import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({ summary: 'List all active subscription packages (optional landlord filter for custom plans)' })
  @Get('packages')
  getAllPackages(@Query('landlordId') landlordId?: string) {
    return this.subscriptionsService.getAllPackages(landlordId);
  }

  @ApiOperation({ summary: 'Create a new subscription package — Admin only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  @Post('packages')
  createPackage(
    @Body()
    dto: {
      name: string;
      price: number;
      max_properties: number;
      max_tenants: number;
      max_staff: number;
      is_custom?: boolean;
      target_landlord_id?: string;
    },
  ) {
    return this.subscriptionsService.createPackage(dto);
  }

  @ApiOperation({ summary: 'Get current landlord subscription details' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  @Get('my-subscription')
  getMySubscription(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.subscriptionsService.getLandlordSubscription(landlordId);
  }

  @ApiOperation({ summary: 'Upgrade / Subscribe to a package — Landlord only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.LANDLORD)
  @Post('upgrade')
  upgradeSubscription(
    @CurrentUser() user: any,
    @Body() dto: { packageId: string },
  ) {
    const landlordId = user.landlord_profile?.id;
    return this.subscriptionsService.assignSubscription(landlordId, dto.packageId);
  }

  @ApiOperation({ summary: 'Cancel current subscription — Landlord only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.LANDLORD)
  @Post('cancel')
  cancelSubscription(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile.id;
    return this.subscriptionsService.cancelSubscription(landlordId);
  }

  @ApiOperation({ summary: 'Delete a subscription package — Admin only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  @Delete('packages/:id')
  deletePackage(@Param('id') id: string) {
    return this.subscriptionsService.deletePackage(id);
  }

  // ─── CUSTOM PACKAGE REQUESTS ─────────────────
  @ApiOperation({ summary: 'Request custom subscription package — Landlord only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.LANDLORD)
  @Post('custom-request')
  createCustomRequest(
    @CurrentUser() user: any,
    @Body()
    dto: {
      max_properties: number;
      max_tenants: number;
      max_staff: number;
      notes?: string;
    },
  ) {
    return this.subscriptionsService.createCustomRequest(user.landlord_profile.id, dto);
  }

  @ApiOperation({ summary: 'List custom package requests — Landlord or SAAS_ADMIN' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.LANDLORD, GlobalRole.SAAS_ADMIN)
  @Get('custom-requests')
  getCustomRequests(@CurrentUser() user: any) {
    const landlordId = user.global_role === GlobalRole.LANDLORD ? user.landlord_profile?.id : undefined;
    return this.subscriptionsService.getCustomRequests(landlordId);
  }

  @ApiOperation({ summary: 'Approve custom package request & set price — SAAS_ADMIN only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  @Post('custom-requests/:id/approve')
  approveCustomRequest(@Param('id') id: string, @Body() dto: { price: number }) {
    return this.subscriptionsService.approveCustomRequest(id, dto.price);
  }

  @ApiOperation({ summary: 'Reject custom package request — SAAS_ADMIN only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  @Post('custom-requests/:id/reject')
  rejectCustomRequest(@Param('id') id: string) {
    return this.subscriptionsService.rejectCustomRequest(id);
  }

  // ─── BANK TRANSFER SUBSCRIPTION PAYMENTS ─────
  @ApiOperation({ summary: 'Submit bank transfer payment slip for package upgrade — Landlord only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.LANDLORD)
  @Post('bank-transfer')
  submitBankPayment(
    @CurrentUser() user: any,
    @Body()
    dto: {
      package_id: string;
      amount: number;
      receipt_url: string;
      notes?: string;
    },
  ) {
    return this.subscriptionsService.submitBankPayment(user.landlord_profile.id, dto);
  }

  @ApiOperation({ summary: 'List subscription bank transfer payments — SAAS_ADMIN only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  @Get('bank-payments')
  getBankPayments(@Query('status') status?: string) {
    return this.subscriptionsService.getBankPayments(status);
  }

  @ApiOperation({ summary: 'Approve bank transfer subscription payment & activate package — SAAS_ADMIN only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  @Patch('bank-payments/:id/approve')
  approveBankPayment(@Param('id') id: string) {
    return this.subscriptionsService.approveBankPayment(id);
  }

  @ApiOperation({ summary: 'Reject bank transfer subscription payment — SAAS_ADMIN only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  @Patch('bank-payments/:id/reject')
  rejectBankPayment(@Param('id') id: string, @Body() dto: { notes?: string }) {
    return this.subscriptionsService.rejectBankPayment(id, dto.notes);
  }
}

