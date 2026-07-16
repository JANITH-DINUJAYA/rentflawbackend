import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole, TicketPriority, TicketStatus } from '@prisma/client';

@ApiTags('Support Tickets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @ApiOperation({ summary: 'Create a support/maintenance ticket — Tenant only' })
  @Post()
  @Roles(GlobalRole.TENANT)
  create(
    @CurrentUser() user: any,
    @Body() dto: { category: string; description: string; priority: TicketPriority },
  ) {
    return this.supportService.createTicket(user.id, dto);
  }

  @ApiOperation({ summary: 'Get support tickets list' })
  @Get()
  findAll(@CurrentUser() user: any) {
    if (user.global_role === GlobalRole.TENANT) {
      // Tenants only see their own tickets
      return this.supportService.getTickets(user.id);
    } else if (user.global_role === GlobalRole.LANDLORD || user.global_role === GlobalRole.STAFF) {
      // Landlords see all tickets from their active tenants
      const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
      return this.supportService.getTicketsByLandlord(landlordId);
    } else {
      // Admins see all tickets
      return this.supportService.getTickets();
    }
  }

  @ApiOperation({ summary: 'Update support ticket status — Landlord/Staff/Admin' })
  @Patch(':id/status')
  @Roles(GlobalRole.LANDLORD, GlobalRole.STAFF, GlobalRole.SAAS_ADMIN)
  updateStatus(
    @Param('id') ticketId: string,
    @Body() dto: { status: TicketStatus },
  ) {
    const resolvedAt = dto.status === TicketStatus.COMPLETED ? new Date() : undefined;
    return this.supportService.updateTicketStatus(ticketId, dto.status, resolvedAt);
  }
}
