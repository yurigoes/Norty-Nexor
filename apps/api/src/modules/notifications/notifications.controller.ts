import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CondominiumId, CurrentUser } from '../../common/decorators';
import type { RequestUser } from '../../common/types';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(user, condominiumId, Math.min(Number(limit) || 60, 200));
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: RequestUser, @CondominiumId() condominiumId: string) {
    return { count: await this.notifications.unreadCount(user, condominiumId) };
  }

  @Post(':id/read')
  read(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
  ) {
    return this.notifications.markRead(user, condominiumId, id);
  }

  @Post('read-all')
  readAll(@CurrentUser() user: RequestUser, @CondominiumId() condominiumId: string) {
    return this.notifications.markAllRead(user, condominiumId);
  }
}
