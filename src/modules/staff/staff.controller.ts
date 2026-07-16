import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import type { AddStaffDto } from './staff.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Staff')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(GlobalRole.LANDLORD)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @ApiOperation({ summary: 'List all staff for this landlord' })
  @Get()
  getStaff(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.staffService.getStaff(landlordId);
  }

  @ApiOperation({ summary: 'Add a new staff member' })
  @Post()
  addStaff(@CurrentUser() user: any, @Body() body: AddStaffDto) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.staffService.addStaff(landlordId, body);
  }

  @ApiOperation({ summary: 'Remove a staff member' })
  @Delete(':id')
  removeStaff(@Param('id') id: string, @CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.staffService.removeStaff(landlordId, id);
  }
}
