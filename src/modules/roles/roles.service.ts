import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async createRole(landlordId: string | null, name: string) {
    return this.prisma.customRole.create({
      data: {
        landlord_id: landlordId,
        name,
      },
    });
  }

  async addPermission(roleId: string, landlordId: string | null, action: string) {
    // Validate role belongs to landlord/system
    const role = await this.prisma.customRole.findFirst({
      where: { id: roleId, landlord_id: landlordId },
    });
    if (!role) throw new NotFoundException('Role not found');

    return this.prisma.permission.create({
      data: {
        role_id: roleId,
        action,
      },
    });
  }

  async removePermission(permissionId: string, landlordId: string | null) {
    const perm = await this.prisma.permission.findFirst({
      where: {
        id: permissionId,
        role: { landlord_id: landlordId },
      },
    });
    if (!perm) throw new NotFoundException('Permission not found');

    return this.prisma.permission.delete({
      where: { id: permissionId },
    });
  }

  async getRoleWithPermissions(roleId: string, landlordId: string | null) {
    const role = await this.prisma.customRole.findFirst({
      where: { id: roleId, landlord_id: landlordId },
      include: { permissions: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async deleteRole(roleId: string, landlordId: string | null) {
    const role = await this.prisma.customRole.findFirst({
      where: { id: roleId, landlord_id: landlordId },
    });
    if (!role) throw new NotFoundException('Role not found');

    // Check if any staff member uses this role
    const staffCount = await this.prisma.staffProfile.count({
      where: { role_id: roleId },
    });
    if (staffCount > 0) {
      throw new BadRequestException('Cannot delete role: Assigned to active staff');
    }

    return this.prisma.customRole.delete({
      where: { id: roleId },
    });
  }

  async findAllRoles(landlordId: string | null) {
    return this.prisma.customRole.findMany({
      where: { landlord_id: landlordId },
      include: { permissions: true },
    });
  }
}
