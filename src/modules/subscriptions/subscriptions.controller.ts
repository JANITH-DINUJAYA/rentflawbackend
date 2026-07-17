import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({ summary: 'List all active subscription packages' })
  @Get('packages')
  getAllPackages() {
    return this.subscriptionsService.getAllPackages();
  }

  @ApiOperation({ summary: 'Create a new subscription package — Admin only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  @Post('packages')
  createPackage(
    @Body() dto: { name: string; price: number; max_properties: number; max_tenants: number; max_staff: number },
  ) {
    return this.subscriptionsService.createPackage(dto);
  }

  @ApiOperation({ summary: 'Get current landlord subscription details' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  @Get('my-subscription')
  getMySubscription(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.subscriptionsService.getLandlordSubscription(landlordId);
  }

  @ApiOperation({ summary: 'Upgrade / Subscribe to a package — Landlord only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.LANDLORD)
  @Post('upgrade')
  upgradeSubscription(
    @CurrentUser() user: any,
    @Body() dto: { packageId: string },
  ) {
    const landlordId = user.landlord_profile?.id;
    return this.subscriptionsService.assignSubscription(landlordId, dto.packageId);
  }

  @ApiOperation({ summary: 'Cancel current subscription — Landlord only' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.LANDLORD)
  @Post('cancel')
  cancelSubscription(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile.id;
    return this.subscriptionsService.cancelSubscription(landlordId);
  }

  @ApiOperation({ summary: 'Delete a subscription package — Admin only (blocked if any active subscriptions exist on it)' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  @Delete('packages/:id')
  deletePackage(@Param('id') id: string) {
    return this.subscriptionsService.deletePackage(id);
  }
}

