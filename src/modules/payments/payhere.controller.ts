import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '@prisma/client';

@ApiTags('Payments')
@Controller('payments/payhere')
export class PayhereController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiOperation({ summary: 'Initiate PayHere Sandbox Web Checkout params — Tenant only' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.TENANT)
  @Post('initiate')
  initiateCheckout(
    @CurrentUser() user: any,
    @Body() dto: { invoice_id: string },
  ) {
    return this.paymentsService.getPayHereParams(user.id, dto.invoice_id);
  }

  @ApiOperation({ summary: 'PayHere server notification webhook — Public Callback' })
  @Post('notify')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: any) {
    return this.paymentsService.processPayHereWebhook(payload);
  }

  @ApiOperation({ summary: 'Sandbox Local Bypass payout settle — Tenant only' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(GlobalRole.TENANT)
  @Post('local-bypass')
  localBypass(
    @CurrentUser() user: any,
    @Body() dto: { invoice_id: string },
  ) {
    return this.paymentsService.processLocalBypassPayment(user.id, dto.invoice_id);
  }
}
