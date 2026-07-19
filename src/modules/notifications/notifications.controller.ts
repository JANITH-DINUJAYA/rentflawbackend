import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Get current user notifications' })
  @Get()
  getNotifications(@CurrentUser() user: any) {
    return this.notificationsService.getNotifications(user.id);
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @Patch(':id/read')
  markAsRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @ApiOperation({ summary: 'Clear all notifications' })
  @Delete()
  clearAll(@CurrentUser() user: any) {
    return this.notificationsService.clearAll(user.id);
  }

  @ApiOperation({ summary: 'Send test email via Resend gateway — SAAS_ADMIN only' })
  @Post('test-email')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SAAS_ADMIN)
  async testEmail(@Body() dto: { to: string }) {
    await this.notificationsService.sendAdminTestEmail(dto.to);
    return { message: `Test email dispatched to ${dto.to}` };
  }
}

