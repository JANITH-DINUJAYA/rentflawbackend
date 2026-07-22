import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AgreementsService } from './agreements.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole, AgreementStatus, LeavingOption } from '@prisma/client';

@ApiTags('Agreements')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('agreements')
export class AgreementsController {
  constructor(private agreementsService: AgreementsService) {}

  @ApiOperation({ summary: 'Draft a new rental agreement — Landlord only' })
  @Post()
  @Roles(GlobalRole.LANDLORD)
  create(
    @CurrentUser() user: any,
    @Body()
    dto: {
      tenant_id: string;
      property_id: string;
      room_id: string;
      rent_amount: number;
      security_deposit: number;
      start_date: Date;
      end_date: Date;
      collection_day: number;
      grace_period_days: number;
      late_fee_flat: number;
      leaving_option: LeavingOption;
      leaving_rule?: LeavingOption;
    },
  ) {
    return this.agreementsService.create(user.landlord_profile.id, dto);
  }

  @ApiOperation({ summary: 'Activate a draft agreement — Landlord only' })
  @Patch(':id/activate')
  @Roles(GlobalRole.LANDLORD)
  activate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.agreementsService.activate(user.landlord_profile.id, id);
  }

  @ApiOperation({ summary: 'Accept lease invitation — Tenant only' })
  @Patch(':id/accept-invitation')
  @Roles(GlobalRole.TENANT)
  acceptInvitation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.agreementsService.acceptInvitation(user.id, id);
  }

  @ApiOperation({ summary: 'Terminate active agreement with proration exit calculations' })
  @Patch(':id/terminate')
  @Roles(GlobalRole.LANDLORD, GlobalRole.SAAS_ADMIN)
  terminate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { exit_date: Date; deduct_from_deposit?: boolean; deduction_reason?: string },
  ) {
    const landlordId = user.global_role === GlobalRole.SAAS_ADMIN ? null : user.landlord_profile.id;
    return this.agreementsService.terminate(
      landlordId,
      id,
      new Date(dto.exit_date),
      dto.deduct_from_deposit,
      dto.deduction_reason,
    );
  }

  @ApiOperation({ summary: 'List landlord/admin agreements' })
  @Get()
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
  findAll(@CurrentUser() user: any, @Query('status') status?: AgreementStatus) {
    if (user.global_role === GlobalRole.SAAS_ADMIN) {
      return this.agreementsService.findAllAdmin(status);
    }
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.agreementsService.findAll(landlordId, status);
  }

  @ApiOperation({ summary: 'List all deposit refunds for this landlord' })
  @Get('refunds/list')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  findAllRefunds(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.agreementsService.findAllRefunds(landlordId);
  }

  @ApiOperation({ summary: 'Mark a deposit refund as paid — Landlord only' })
  @Patch('refunds/:id/pay')
  @Roles(GlobalRole.LANDLORD)
  markRefundPaid(@CurrentUser() user: any, @Param('id') id: string) {
    return this.agreementsService.markRefundPaid(user.landlord_profile.id, id);
  }

  @ApiOperation({ summary: 'Get active/past tenant agreement history — Tenant only' })
  @Get('history')
  @Roles(GlobalRole.TENANT)
  findTenantHistory(@CurrentUser() user: any) {
    return this.agreementsService.findTenantHistory(user.id);
  }

  @ApiOperation({ summary: 'Request agreement termination (request to leave) — Tenant only' })
  @Patch(':id/request-termination')
  @Roles(GlobalRole.TENANT)
  requestTermination(@CurrentUser() user: any, @Param('id') id: string) {
    return this.agreementsService.requestTermination(user.id, id);
  }

  @ApiOperation({ summary: 'Preview termination cost before requesting to leave — Tenant/Landlord' })
  @Get(':id/termination-cost')
  @Roles(GlobalRole.TENANT, GlobalRole.LANDLORD, GlobalRole.STAFF)
  calculateTerminationCost(@CurrentUser() user: any, @Param('id') id: string) {
    const isTenant = user.global_role === GlobalRole.TENANT;
    const actorId = isTenant ? user.id : (user.landlord_profile?.id || user.staff_profile?.landlord_id);
    return this.agreementsService.calculateTerminationCost(actorId, isTenant, id);
  }

  @ApiOperation({ summary: 'Get single agreement details' })
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.agreementsService.findOne(landlordId, id);
  }

  @ApiOperation({ summary: 'Soft-delete rental agreement — Landlord/Admin' })
  @Delete(':id')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.global_role === GlobalRole.SAAS_ADMIN ? null : (user.landlord_profile?.id || user.staff_profile?.landlord_id);
    return this.agreementsService.delete(landlordId, id);
  }
}

