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
import { MessagesService } from './messages.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @ApiOperation({ summary: 'List all message history and conversations' })
  @Get()
  getConversations(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.messagesService.getConversations(user.id, user.global_role, landlordId);
  }

  @ApiOperation({ summary: 'Get list of contacts available to chat' })
  @Get('contacts')
  getInboxContacts(@CurrentUser() user: any) {
    const landlordId = user.landlord_profile?.id || user.staff_profile?.landlord_id;
    return this.messagesService.getInboxContacts(user.id, user.global_role, landlordId);
  }

  @ApiOperation({ summary: 'Send a new direct message or support message' })
  @Post()
  sendMessage(
    @CurrentUser() user: any,
    @Body() dto: { receiver_id?: string; to_admin?: boolean; content: string },
  ) {
    return this.messagesService.sendMessage(user.id, dto);
  }

  @ApiOperation({ summary: 'Mark conversation with a contact as read' })
  @Patch('read/:otherPartyId')
  markConversationRead(@CurrentUser() user: any, @Param('otherPartyId') otherPartyId: string) {
    return this.messagesService.markConversationRead(user.id, otherPartyId);
  }

  @ApiOperation({ summary: 'Mark support tickets read' })
  @Patch('read-support')
  markSupportRead() {
    return this.messagesService.markSupportRead();
  }
}
