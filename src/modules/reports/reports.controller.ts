import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @ApiOperation({ summary: 'Get income report for a specific month/year' })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({ name: 'year', type: Number })
  @ApiQuery({ name: 'landlordId', required: false })
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
  @Get('income')
  getIncomeReport(
    @CurrentUser() user: any,
    @Query('month') month: string,
    @Query('year') year: string,
    @Query('landlordId') landlordId?: string,
  ) {
    const resolvedLandlordId =
      user.global_role === GlobalRole.SAAS_ADMIN
        ? landlordId || null
        : user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.reportsService.getIncomeReport(resolvedLandlordId, +month, +year);
  }

  @ApiOperation({ summary: 'Get occupancy report' })
  @ApiQuery({ name: 'landlordId', required: false })
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
  @Get('occupancy')
  getOccupancyReport(@CurrentUser() user: any, @Query('landlordId') landlordId?: string) {
    const resolvedLandlordId =
      user.global_role === GlobalRole.SAAS_ADMIN
        ? landlordId || null
        : user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.reportsService.getOccupancyReport(resolvedLandlordId);
  }

  @ApiOperation({ summary: 'Get overdue invoices report' })
  @ApiQuery({ name: 'landlordId', required: false })
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
  @Get('overdue')
  getOverdueReport(@CurrentUser() user: any, @Query('landlordId') landlordId?: string) {
    const resolvedLandlordId =
      user.global_role === GlobalRole.SAAS_ADMIN
        ? landlordId || null
        : user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.reportsService.getOverdueReport(resolvedLandlordId);
  }

  @ApiOperation({ summary: 'Get tenant report' })
  @ApiQuery({ name: 'landlordId', required: false })
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
  @Get('tenants')
  getTenantReport(@CurrentUser() user: any, @Query('landlordId') landlordId?: string) {
    const resolvedLandlordId =
      user.global_role === GlobalRole.SAAS_ADMIN
        ? landlordId || null
        : user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.reportsService.getTenantReport(resolvedLandlordId);
  }
}
