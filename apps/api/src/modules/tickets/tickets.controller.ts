import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CondominiumId, CurrentUser, RequirePermission } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { AddTicketUpdateDto, CreateTicketDto } from './dto';
import type { RequestUser } from '../../common/types';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @RequirePermission('tickets.view')
  list(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Query() query: PageQueryDto,
    @Query('status') status?: string,
  ) {
    return this.tickets.list(user, condominiumId, query, status);
  }

  @Get(':id')
  @RequirePermission('tickets.view')
  detail(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
  ) {
    return this.tickets.detail(user, condominiumId, id);
  }

  @Post()
  @RequirePermission('tickets.manage')
  create(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Body() dto: CreateTicketDto,
  ) {
    return this.tickets.create(user, condominiumId, dto);
  }

  @Post(':id/updates')
  @RequirePermission('tickets.manage')
  addUpdate(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
    @Body() dto: AddTicketUpdateDto,
  ) {
    return this.tickets.addUpdate(user, condominiumId, id, dto);
  }
}
