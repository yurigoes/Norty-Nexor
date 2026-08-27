import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CondominiumId, CurrentUser, RequirePermission } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { CreateReservationDto } from './dto';
import type { RequestUser } from '../../common/types';

@Controller()
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('common-areas')
  @RequirePermission('reservations.view')
  areas(@CondominiumId() condominiumId: string) {
    return this.reservations.areas(condominiumId);
  }

  @Get('common-areas/:areaId/availability')
  @RequirePermission('reservations.view')
  availability(
    @CondominiumId() condominiumId: string,
    @Param('areaId') areaId: string,
    @Query('date') date: string,
  ) {
    return this.reservations.availability(condominiumId, areaId, date);
  }

  @Get('reservations')
  @RequirePermission('reservations.view')
  list(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Query() query: PageQueryDto,
    @Query('status') status?: string,
  ) {
    return this.reservations.list(user, condominiumId, query, status);
  }

  @Post('reservations')
  @RequirePermission('reservations.manage')
  create(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservations.create(user, condominiumId, dto);
  }

  @Post('reservations/:id/approve')
  @RequirePermission('reservations.approve')
  approve(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
  ) {
    return this.reservations.decide(user, condominiumId, id, 'confirmada');
  }

  @Post('reservations/:id/reject')
  @RequirePermission('reservations.approve')
  reject(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.reservations.decide(user, condominiumId, id, 'recusada', reason);
  }

  @Post('reservations/:id/cancel')
  @RequirePermission('reservations.manage')
  cancel(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
  ) {
    return this.reservations.cancel(user, condominiumId, id);
  }
}
