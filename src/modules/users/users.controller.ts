import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @ApiOperation({ summary: 'Search tenant by referral code' })
  @Get('search/tenant/:code')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
  findByTenantCode(@Param('code') code: string) {
    return this.usersService.findByTenantCode(code);
  }

  @ApiOperation({ summary: 'Get all tenants — admin only' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get('tenants')
  @Roles(GlobalRole.SAAS_ADMIN)
  getAllTenants(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getAllTenants(page, limit);
  }

  @ApiOperation({ summary: 'Get all landlords — admin only' })
  @Get('landlords')
  @Roles(GlobalRole.SAAS_ADMIN)
  getAllLandlords(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getAllLandlords(page, limit);
  }

  @ApiOperation({ summary: 'Get user profile by ID' })
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @ApiOperation({ summary: 'Update own profile' })
  @Patch('profile')
  updateProfile(
    @CurrentUser() user: any,
    @Body() dto: { first_name?: string; last_name?: string; phone?: string },
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @ApiOperation({ summary: 'Suspend or activate a user — admin only' })
  @Patch(':id/status')
  @Roles(GlobalRole.SAAS_ADMIN)
  toggleActive(
    @Param('id') id: string,
    @Body() dto: { is_active: boolean },
  ) {
    return this.usersService.toggleActive(id, dto.is_active);
  }

  @ApiOperation({ summary: 'Change own password' })
  @Patch('password')
  changePassword(
    @CurrentUser() user: any,
    @Body() dto: { current_password: string; new_password: string },
  ) {
    return this.usersService.changePassword(
      user.id,
      dto.current_password,
      dto.new_password,
    );
  }

  @ApiOperation({ summary: 'Delete user account — admin only' })
  @Delete(':id')
  @Roles(GlobalRole.SAAS_ADMIN)
  deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
