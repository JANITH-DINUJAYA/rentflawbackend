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

  @ApiOperation({ summary: 'Create property — Landlord only' })
  @Post()
  @Roles(GlobalRole.LANDLORD)
  create(
    @CurrentUser() user: any,
    @Body() dto: { name: string; address: string; type: PropertyType },
  ) {
    return this.propertiesService.create(user.id, dto);
  }

  @ApiOperation({ summary: 'List all properties for landlord' })
  @Get()
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  findAll(@CurrentUser() user: any) {
    // If staff, we would need to map user to their landlord_id.
    // For simplicity, we check if user has a landlord profile or staff profile
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.propertiesService.findAll(landlordId);
  }

  @ApiOperation({ summary: 'Get single property details' })
  @Get(':id')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.propertiesService.findOne(landlordId, id);
  }

  @ApiOperation({ summary: 'Update property details' })
  @Patch(':id')
  @Roles(GlobalRole.LANDLORD)
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { name?: string; address?: string; type?: PropertyType },
  ) {
    return this.propertiesService.update(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Soft archive a property' })
  @Patch(':id/archive')
  @Roles(GlobalRole.LANDLORD)
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.propertiesService.archive(user.id, id);
  }
}
