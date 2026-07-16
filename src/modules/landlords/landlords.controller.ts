import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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

  @ApiOperation({ summary: 'Create a new landlord — Admin only' })
  @Post()
  @Roles(GlobalRole.SAAS_ADMIN)
  create(
    @Body() dto: {
      email: string;
      first_name: string;
      last_name: string;
      phone: string;
      nic_or_passport: string;
      password?: string;
      company_name?: string;
    },
  ) {
    return this.landlordsService.create(dto);
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

  @ApiOperation({ summary: 'Update specific landlord details — Admin only' })
  @Patch(':id')
  @Roles(GlobalRole.SAAS_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: {
      company_name?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      nic_or_passport?: string;
      email?: string;
    },
  ) {
    return this.landlordsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete landlord details — Admin only' })
  @Delete(':id')
  @Roles(GlobalRole.SAAS_ADMIN)
  delete(@Param('id') id: string) {
    return this.landlordsService.delete(id);
  }
}
