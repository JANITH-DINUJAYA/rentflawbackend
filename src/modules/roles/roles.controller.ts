import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  private getLandlordId(user: any): string | null {
    if (user.global_role === GlobalRole.SAAS_ADMIN) {
      return null;
    }
    return user.landlord_profile?.id || user.staff_profile?.landlord_id;
  }

  @ApiOperation({ summary: 'List all roles' })
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.rolesService.findAllRoles(this.getLandlordId(user));
  }

  @ApiOperation({ summary: 'Get a single role with permissions' })
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.rolesService.getRoleWithPermissions(id, this.getLandlordId(user));
  }

  @ApiOperation({ summary: 'Create a new role' })
  @Post()
  create(@CurrentUser() user: any, @Body() body: { name: string }) {
    return this.rolesService.createRole(this.getLandlordId(user), body.name);
  }

  @ApiOperation({ summary: 'Delete a role' })
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.rolesService.deleteRole(id, this.getLandlordId(user));
  }

  @ApiOperation({ summary: 'Add a permission to a role' })
  @Post(':id/permissions')
  addPermission(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { action: string },
  ) {
    return this.rolesService.addPermission(id, this.getLandlordId(user), body.action);
  }

  @ApiOperation({ summary: 'Remove a permission from a role' })
  @Delete(':roleId/permissions/:permissionId')
  removePermission(
    @Param('permissionId') permissionId: string,
    @CurrentUser() user: any,
  ) {
    return this.rolesService.removePermission(permissionId, this.getLandlordId(user));
  }

  @ApiOperation({ summary: 'Bulk update permissions for a role' })
  @Put(':id/permissions')
  updatePermissions(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { actions: string[] },
  ) {
    return this.rolesService.updateRolePermissions(id, this.getLandlordId(user), body.actions);
  }
}
