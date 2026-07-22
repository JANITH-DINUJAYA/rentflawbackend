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
import { StaffService } from './staff.service';
import type { AddStaffDto } from './staff.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Staff')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(GlobalRole.LANDLORD, GlobalRole.SAAS_ADMIN)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  private getLandlordId(user: any): string | null {
    if (user.global_role === GlobalRole.SAAS_ADMIN) {
      return null;
    }
    return user.landlord_profile?.id || user.staff_profile?.landlord_id;
  }

  @ApiOperation({ summary: 'List all staff' })
  @Get()
  getStaff(@CurrentUser() user: any) {
    return this.staffService.getStaff(this.getLandlordId(user));
  }

  @ApiOperation({ summary: 'Add a new staff member' })
  @Post()
  addStaff(@CurrentUser() user: any, @Body() body: AddStaffDto) {
    return this.staffService.addStaff(this.getLandlordId(user), body);
  }

  @ApiOperation({ summary: 'Remove a staff member' })
  @Delete(':id')
  removeStaff(@Param('id') id: string, @CurrentUser() user: any) {
    return this.staffService.removeStaff(this.getLandlordId(user), id);
  }

  @ApiOperation({ summary: 'Fix login access for a staff member whose global_role was not updated' })
  @Patch(':id/fix-access')
  fixStaffAccess(@Param('id') id: string, @CurrentUser() user: any) {
    return this.staffService.fixStaffAccess(this.getLandlordId(user), id);
  }
}
