import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LandlordsService } from './landlords.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Landlords')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('landlords')
export class LandlordsController {
  constructor(private readonly landlordsService: LandlordsService) {}

  @ApiOperation({ summary: 'List all landlords — Admin only' })
  @Get()
  @Roles(GlobalRole.SAAS_ADMIN)
  findAll() {
    return this.landlordsService.findAll();
  }

  @ApiOperation({ summary: 'Get landlord/staff profile' })
  @Get('profile')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  getProfile(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.landlordsService.findOne(landlordId);
  }

  @ApiOperation({ summary: 'Update landlord profile — Landlord only' })
  @Patch('profile')
  @Roles(GlobalRole.LANDLORD)
  updateProfile(
    @CurrentUser() user: any,
    @Body() dto: { company_name?: string },
  ) {
    const landlordId = user.landlord_profile?.id;
    return this.landlordsService.update(landlordId, dto);
  }
}
