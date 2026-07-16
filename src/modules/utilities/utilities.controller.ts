import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UtilitiesService } from './utilities.service';
import type { CreateUtilityBillDto } from './utilities.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Utilities')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
@Controller('utilities')
export class UtilitiesController {
  constructor(private readonly utilitiesService: UtilitiesService) {}

  @ApiOperation({ summary: 'List all utility bills for the landlord' })
  @Get()
  findAll(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.utilitiesService.findAll(landlordId);
  }

  @ApiOperation({ summary: 'Create a new utility bill' })
  @Post()
  create(@CurrentUser() user: any, @Body() body: CreateUtilityBillDto) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.utilitiesService.createUtilityBill(landlordId, body);
  }
}
