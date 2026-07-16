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
import { RolesService } from './roles.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(GlobalRole.LANDLORD, GlobalRole.STAFF)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @ApiOperation({ summary: 'List all roles for the landlord' })
  @Get()
  findAll(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.rolesService.findAllRoles(landlordId);
  }

  @ApiOperation({ summary: 'Get a single role with permissions' })
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.rolesService.getRoleWithPermissions(id, landlordId);
  }

  @ApiOperation({ summary: 'Create a new role' })
  @Post()
  create(@CurrentUser() user: any, @Body() body: { name: string }) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.rolesService.createRole(landlordId, body.name);
  }

  @ApiOperation({ summary: 'Delete a role' })
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.rolesService.deleteRole(id, landlordId);
  }

  @ApiOperation({ summary: 'Add a permission to a role' })
  @Post(':id/permissions')
  addPermission(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { action: string },
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.rolesService.addPermission(id, landlordId, body.action);
  }

  @ApiOperation({ summary: 'Remove a permission from a role' })
  @Delete(':roleId/permissions/:permissionId')
  removePermission(
    @Param('permissionId') permissionId: string,
    @CurrentUser() user: any,
  ) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.rolesService.removePermission(permissionId, landlordId);
  }
}
