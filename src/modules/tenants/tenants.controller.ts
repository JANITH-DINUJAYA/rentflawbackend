import {
  Controller,
  Get,
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
}
