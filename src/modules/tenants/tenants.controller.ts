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
import { TenantsService } from './tenants.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Tenants')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @ApiOperation({ summary: 'List all tenants — Admin only' })
  @Get()
  @Roles(GlobalRole.SAAS_ADMIN)
  findAll() {
    return this.tenantsService.findAllForAdmin();
  }

  @ApiOperation({ summary: 'Create a new tenant — Admin only' })
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
    },
  ) {
    return this.tenantsService.create(dto);
  }

  @ApiOperation({ summary: 'List tenants under this landlord — Landlord/Staff' })
  @Get('my-tenants')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  getMyTenants(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.tenantsService.findAllForLandlord(landlordId);
  }

  @ApiOperation({ summary: 'Get tenant profile — Tenant only' })
  @Get('profile')
  @Roles(GlobalRole.TENANT)
  getProfile(@CurrentUser() user: any) {
    return this.tenantsService.getTenantProfile(user.id);
  }

  @ApiOperation({ summary: 'Update a specific tenant — Admin only' })
  @Patch(':id')
  @Roles(GlobalRole.SAAS_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: {
      first_name?: string;
      last_name?: string;
      phone?: string;
      nic_or_passport?: string;
      email?: string;
      is_active?: boolean;
    },
  ) {
    return this.tenantsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete a specific tenant — Admin only' })
  @Delete(':id')
  @Roles(GlobalRole.SAAS_ADMIN)
  delete(@Param('id') id: string) {
    return this.tenantsService.delete(id);
  }

  @ApiOperation({ summary: 'Bulk delete/deactivate tenants — Admin only' })
  @Post('bulk-delete')
  @Roles(GlobalRole.SAAS_ADMIN)
  bulkDelete(@Body() dto: { ids: string[] }) {
    return this.tenantsService.bulkDelete(dto.ids);
  }

  @ApiOperation({ summary: 'List tenants with positive credit balance — Landlord only' })
  @Get('with-credit')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  getTenantsWithCredit(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.tenantsService.findTenantsWithCredit(landlordId);
  }

  @ApiOperation({ summary: 'Process credit payout to tenant — Landlord only' })
  @Post(':id/payout-credit')
  @Roles(GlobalRole.LANDLORD)
  payoutCredit(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tenantsService.payoutCredit(user.landlord_profile.id, id);
  }
}
