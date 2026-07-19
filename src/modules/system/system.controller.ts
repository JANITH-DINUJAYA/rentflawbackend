import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SystemService } from './system.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('System')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @ApiOperation({ summary: 'Get platform runtime logs — SAAS_ADMIN only' })
  @Get('logs')
  @Roles(GlobalRole.SAAS_ADMIN)
  getLogs(@Query('limit') limit?: string) {
    return this.systemService.getLogs(limit ? Number(limit) : 100);
  }

  @ApiOperation({ summary: 'Get current maintenance mode status' })
  @Get('maintenance')
  @Roles(GlobalRole.SAAS_ADMIN)
  getMaintenanceMode() {
    return { maintenance_mode: this.systemService.getMaintenanceMode() };
  }

  @ApiOperation({ summary: 'Toggle platform maintenance mode — SAAS_ADMIN only' })
  @Post('maintenance')
  @Roles(GlobalRole.SAAS_ADMIN)
  setMaintenanceMode(@Body() dto: { enabled: boolean }) {
    this.systemService.setMaintenanceMode(dto.enabled);
    return { maintenance_mode: this.systemService.getMaintenanceMode() };
  }
}
