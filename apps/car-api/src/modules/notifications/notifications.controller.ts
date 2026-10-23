import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { ContextKinds, OrgCtx, type OrgContext } from '../../common/context';
import { PageQueryDto, ToBool } from '../../common/pagination';
import { NotificationsService } from './notifications.service';

class NotificationQueryDto extends PageQueryDto {
  @IsOptional() @ToBool() unread?: boolean;
  @IsOptional() @IsIn(['INFO', 'WARNING', 'CRITICAL', 'SUCCESS']) severity?: string;
}

/** Usado pela equipe, pelo suporte autorizado e pelo portal do cliente. */
@ContextKinds('STAFF', 'SUPPORT', 'CUSTOMER')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() query: NotificationQueryDto) {
    return this.notifications.list(ctx, query);
  }

  @Get('unread-count')
  unread(@OrgCtx() ctx: OrgContext) {
    return this.notifications.unreadCount(ctx);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@OrgCtx() ctx: OrgContext) {
    return this.notifications.markAllRead(ctx);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  read(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(ctx, id);
  }
}
