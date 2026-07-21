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
import { RoomsService } from './rooms.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole, OccupancyType } from '@prisma/client';

@ApiTags('Rooms')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('rooms')
@Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @ApiOperation({ summary: 'Create a new room' })
  @Post()
  create(
    @CurrentUser() user: any,
    @Body() dto: { floor_id: string; room_number: string; occupancy_type: OccupancyType; capacity?: number; base_rent: number },
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.roomsService.create(landlordId, dto);
  }

  @ApiOperation({ summary: 'List all rooms for a landlord' })
  @Get()
  findAll(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.roomsService.findAll(landlordId);
  }

  @ApiOperation({ summary: 'Get occupancy and capacity stats for landlord dashboard' })
  @Get('stats')
  getStats(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.roomsService.getOccupancyStats(landlordId);
  }

  @ApiOperation({ summary: 'Get details of a single room' })
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.roomsService.findOne(id, landlordId);
  }

  @ApiOperation({ summary: 'Update a room details' })
  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    dto: {
      room_number?: string;
      occupancy_type?: OccupancyType;
      capacity?: number;
      base_rent?: number;
    },
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.roomsService.update(id, landlordId, dto);
  }

  @ApiOperation({ summary: 'Archive a room' })
  @Patch(':id/archive')
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.roomsService.archive(id, landlordId);
  }

  @ApiOperation({ summary: 'Bulk archive multiple rooms' })
  @Post('bulk-archive')
  bulkArchive(
    @CurrentUser() user: any,
    @Body() dto: { ids: string[] },
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.roomsService.bulkArchive(dto.ids, landlordId);
  }
}
