import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { CondominiumId, CurrentUser, RequirePermission } from '../../common/decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { CreateDeliveryDto, PickupDeliveryDto } from './dto';
import type { RequestUser } from '../../common/types';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  @RequirePermission('deliveries.view')
  list(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Query() query: PageQueryDto,
    @Query('status') status?: string,
  ) {
    return this.deliveries.list(user, condominiumId, query, status);
  }

  @Post()
  @RequirePermission('deliveries.manage')
  create(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Body() dto: CreateDeliveryDto,
  ) {
    return this.deliveries.create(user, condominiumId, dto);
  }

  @Post(':id/pickup')
  @RequirePermission('deliveries.manage')
  pickup(
    @CurrentUser() user: RequestUser,
    @CondominiumId() condominiumId: string,
    @Param('id') id: string,
    @Body() dto: PickupDeliveryDto,
  ) {
    return this.deliveries.pickup(user, condominiumId, id, dto);
  }
}
