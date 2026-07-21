import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole, PropertyType } from '@prisma/client';

@ApiTags('Properties')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('properties')
export class PropertiesController {
  constructor(private propertiesService: PropertiesService) {}

  private getLandlordId(user: any): string | null {
    if (user.global_role === GlobalRole.SAAS_ADMIN) {
      return null;
    }
    return user.landlord_profile?.id || user.staff_profile?.landlord_id;
  }

  @ApiOperation({ summary: 'Create property — Landlord only' })
  @Post()
  @Roles(GlobalRole.LANDLORD)
  create(
    @CurrentUser() user: any,
    @Body() dto: { name: string; address: string; type: PropertyType },
  ) {
    const landlordId = user.landlord_profile?.id;
    return this.propertiesService.create(landlordId, dto);
  }

  @ApiOperation({ summary: 'List all properties' })
  @Get()
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
  findAll(@CurrentUser() user: any) {
    return this.propertiesService.findAll(this.getLandlordId(user));
  }

  @ApiOperation({ summary: 'Get single property details' })
  @Get(':id')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.propertiesService.findOne(this.getLandlordId(user), id);
  }

  @ApiOperation({ summary: 'Update property details' })
  @Patch(':id')
  @Roles(GlobalRole.LANDLORD, GlobalRole.SAAS_ADMIN)
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { name?: string; address?: string; type?: PropertyType },
  ) {
    return this.propertiesService.update(this.getLandlordId(user), id, dto);
  }

  @ApiOperation({ summary: 'Soft archive a property' })
  @Patch(':id/archive')
  @Roles(GlobalRole.LANDLORD, GlobalRole.SAAS_ADMIN)
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.propertiesService.archive(this.getLandlordId(user), id);
  }

  @ApiOperation({ summary: 'Bulk soft archive properties' })
  @Post('bulk-archive')
  @Roles(GlobalRole.LANDLORD, GlobalRole.SAAS_ADMIN)
  bulkArchive(
    @CurrentUser() user: any,
    @Body() dto: { ids: string[] },
  ) {
    return this.propertiesService.bulkArchive(this.getLandlordId(user), dto.ids);
  }
}
