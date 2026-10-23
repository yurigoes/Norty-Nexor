import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { FleetService } from './fleet.service';
import {
  AvailabilityQueryDto, BlockDto, CreateVehicleDto, DuplicateQueryDto, OdometerDto, RangeQueryDto, ReasonDto, StatusChangeDto,
  TimelineQueryDto, TransferDto, UpdateVehicleDto, VehicleQueryDto,
} from './dto';

@Controller()
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  /* Rotas literais antes de `vehicles/:id`, senão o pipe de UUID as recusa. */

  @RequirePermission('fleet.view')
  @Get('vehicles/check-duplicates')
  duplicates(@OrgCtx() ctx: OrgContext, @Query() q: DuplicateQueryDto) {
    return this.fleet.checkDuplicates(ctx, q);
  }

  @RequirePermission('fleet.view')
  @Get('vehicles/agenda-board')
  board(@OrgCtx() ctx: OrgContext, @Query() q: RangeQueryDto) {
    return this.fleet.agendaBoard(ctx, q);
  }

  @RequirePermission('fleet.view')
  @Get('vehicles/by-plate/:plate')
  byPlate(@OrgCtx() ctx: OrgContext, @Param('plate') plate: string) {
    return this.fleet.byPlate(ctx, plate);
  }

  @RequirePermission('fleet.view')
  @Get('vehicles')
  list(@OrgCtx() ctx: OrgContext, @Query() q: VehicleQueryDto) {
    return this.fleet.list(ctx, q);
  }

  @RequirePermission('fleet.create')
  @Post('vehicles')
  create(@OrgCtx() ctx: OrgContext, @Body() dto: CreateVehicleDto) {
    return this.fleet.create(ctx, dto);
  }

  @RequirePermission('fleet.view')
  @Get('vehicles/:id')
  detail(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.fleet.detail(ctx, id);
  }

  @RequirePermission('fleet.edit')
  @Patch('vehicles/:id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto) {
    return this.fleet.update(ctx, id, dto);
  }

  @RequirePermission('fleet.delete')
  @Delete('vehicles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.fleet.remove(ctx, id, dto.reason);
  }

  @RequirePermission('fleet.view')
  @Get('vehicles/:id/timeline')
  timeline(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: TimelineQueryDto) {
    return this.fleet.timelineOf(ctx, id, q);
  }

  @RequirePermission('fleet.view')
  @Get('vehicles/:id/agenda')
  agenda(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: RangeQueryDto) {
    return this.fleet.agenda(ctx, id, q);
  }

  @RequirePermission('fleet.status')
  @Post('vehicles/:id/status')
  @HttpCode(HttpStatus.OK)
  status(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusChangeDto) {
    return this.fleet.changeStatus(ctx, id, dto.field, dto.to, dto.reason);
  }

  @RequirePermission('fleet.edit')
  @Post('vehicles/:id/odometer')
  @HttpCode(HttpStatus.OK)
  odometer(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OdometerDto) {
    return this.fleet.recordOdometer(ctx, id, dto.km, dto.note);
  }

  @RequirePermission('fleet.edit')
  @Post('vehicles/:id/transfer')
  @HttpCode(HttpStatus.OK)
  transfer(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferDto) {
    return this.fleet.transfer(ctx, id, dto.branchId, dto.reason);
  }

  @RequirePermission('fleet.status')
  @Post('vehicles/:id/blocks')
  block(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BlockDto) {
    return this.fleet.createBlock(ctx, id, dto);
  }

  @RequirePermission('fleet.status')
  @Delete('vehicles/:id/blocks/:allocationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  releaseBlock(
    @OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Param('allocationId', ParseUUIDPipe) allocationId: string, @Body() dto: ReasonDto,
  ) {
    return this.fleet.releaseBlock(ctx, id, allocationId, dto.reason);
  }

  /** Disponibilidade: consultar não reserva nada. */
  @RequirePermission('fleet.view')
  @Get('availability')
  availability(@OrgCtx() ctx: OrgContext, @Query() q: AvailabilityQueryDto) {
    return this.fleet.findAvailable(ctx, q);
  }
}
