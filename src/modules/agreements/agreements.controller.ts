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

  @ApiOperation({ summary: 'Terminate active agreement with proration exit calculations' })
  @Patch(':id/terminate')
  @Roles(GlobalRole.LANDLORD)
  terminate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { exit_date: Date },
  ) {
    return this.agreementsService.terminate(
      user.landlord_profile.id,
      id,
      new Date(dto.exit_date),
    );
  }

  @ApiOperation({ summary: 'List landlord agreements' })
  @Get()
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  findAll(@CurrentUser() user: any, @Query('status') status?: AgreementStatus) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.agreementsService.findAll(landlordId, status);
  }

  @ApiOperation({ summary: 'Get active/past tenant agreement history — Tenant only' })
  @Get('history')
  @Roles(GlobalRole.TENANT)
  findTenantHistory(@CurrentUser() user: any) {
    return this.agreementsService.findTenantHistory(user.id);
  }

  @ApiOperation({ summary: 'Get single agreement details' })
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.agreementsService.findOne(landlordId, id);
  }
}
