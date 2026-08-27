import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { VisitorsService } from './visitors.service';
import { CondominiumId, CurrentUser, RequirePermission } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { CreateVisitorDto } from './dto';
import type { RequestUser } from '../../common/types';

@Controller('visitors')
export class VisitorsController {
  constructor(private readonly visitors: VisitorsService) {}

  @Get()
  @RequirePermission('visitors.view')
  list(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Query() query: PageQueryDto,
    @Query('status') status?: string,
    @Query('date') date?: string,
  ) {
    return this.visitors.list(user, condominiumId, query, { status, date });
  }

  @Get('code/:code')
  @RequirePermission('visitors.approve')
  byCode(@CondominiumId() condominiumId: string, @Param('code') code: string) {
    return this.visitors.byCode(condominiumId, code);
  }

  @Post()
  @RequirePermission('visitors.manage')
  create(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Body() dto: CreateVisitorDto,
  ) {
    return this.visitors.create(user, condominiumId, dto);
  }

  @Post(':id/check-in')
  @RequirePermission('visitors.approve')
  checkIn(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
  ) {
    return this.visitors.checkIn(user, condominiumId, id);
  }

  @Post(':id/check-out')
  @RequirePermission('visitors.approve')
  checkOut(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
  ) {
    return this.visitors.checkOut(user, condominiumId, id);
  }

  @Post(':id/revoke')
  @RequirePermission('visitors.manage')
  revoke(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
  ) {
    return this.visitors.revoke(user, condominiumId, id);
  }
}
