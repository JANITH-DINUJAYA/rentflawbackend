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
import { FloorsService } from './floors.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Floors')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('floors')
@Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
export class FloorsController {
  constructor(private readonly floorsService: FloorsService) {}

  @ApiOperation({ summary: 'Create a new floor' })
  @Post()
  create(
    @CurrentUser() user: any,
    @Body() dto: { property_id: string; name: string },
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.floorsService.create(landlordId, dto);
  }

  @ApiOperation({ summary: 'List all floors for a property' })
  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('property_id') propertyId: string,
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.floorsService.findAll(propertyId, landlordId);
  }

  @ApiOperation({ summary: 'Get details of a single floor' })
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.floorsService.findOne(id, landlordId);
  }

  @ApiOperation({ summary: 'Archive a floor' })
  @Patch(':id/archive')
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.floorsService.archive(id, landlordId);
  }
}
