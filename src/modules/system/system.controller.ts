import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SystemService } from './system.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GlobalRole } from '@prisma/client';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

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

  @ApiOperation({ summary: 'List platform bank accounts for payments' })
  @Get('bank-accounts')
  getBankAccounts(@Query('includeInactive') includeInactive?: string) {
    return this.systemService.getBankAccounts(includeInactive === 'true');
  }

  @ApiOperation({ summary: 'Create new platform bank account — SAAS_ADMIN only' })
  @Post('bank-accounts')
  @Roles(GlobalRole.SAAS_ADMIN)
  createBankAccount(@Body() dto: CreateBankAccountDto) {
    return this.systemService.createBankAccount(dto);
  }

  @ApiOperation({ summary: 'Update platform bank account — SAAS_ADMIN only' })
  @Patch('bank-accounts/:id')
  @Roles(GlobalRole.SAAS_ADMIN)
  updateBankAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.systemService.updateBankAccount(id, dto);
  }

  @ApiOperation({ summary: 'Delete platform bank account — SAAS_ADMIN only' })
  @Delete('bank-accounts/:id')
  @Roles(GlobalRole.SAAS_ADMIN)
  deleteBankAccount(@Param('id') id: string) {
    return this.systemService.deleteBankAccount(id);
  }
}
