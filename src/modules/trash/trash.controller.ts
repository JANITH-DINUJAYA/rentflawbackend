import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TrashService } from './trash.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Trash')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('trash')
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @ApiOperation({ summary: 'List all soft-deleted trash items with 30-day countdown' })
  @Get()
  getTrashItems(@CurrentUser() user: any) {
    return this.trashService.getTrashItems(user);
  }

  @ApiOperation({ summary: 'Restore a soft-deleted item back to active status' })
  @Patch(':entityType/:id/restore')
  restoreItem(@Param('entityType') entityType: string, @Param('id') id: string) {
    return this.trashService.restoreItem(entityType, id);
  }

  @ApiOperation({ summary: 'Permanently purge a soft-deleted item from database' })
  @Delete(':entityType/:id/permanent')
  permanentDelete(@Param('entityType') entityType: string, @Param('id') id: string) {
    return this.trashService.permanentDelete(entityType, id);
  }
}
