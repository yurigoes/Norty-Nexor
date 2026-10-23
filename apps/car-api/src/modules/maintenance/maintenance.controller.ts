import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { MaintenanceService } from './maintenance.service';
import {
  CompleteDto, NoteDto, PlanDto, PlanQueryDto, ReasonDto, ServiceTypeDto, StatusDto, UpdatePlanDto, UpdateServiceTypeDto,
  UpdateWorkOrderDto, WorkOrderDto, WorkOrderItemDto, WorkOrderQueryDto,
} from './dto';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @RequirePermission('maintenance.view')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() query: WorkOrderQueryDto) {
    return this.maintenance.list(ctx, query);
  }

  @RequirePermission('maintenance.view')
  @Get(':id')
  get(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.maintenance.get(ctx, id);
  }

  @RequirePermission('maintenance.manage')
  @Post()
  create(@OrgCtx() ctx: OrgContext, @Body() dto: WorkOrderDto) {
    return this.maintenance.create(ctx, dto);
  }

  @RequirePermission('maintenance.manage')
  @Patch(':id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.maintenance.update(ctx, id, dto);
  }

  @RequirePermission('maintenance.manage')
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  status(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) {
    return this.maintenance.transition(ctx, id, dto.to, dto.note);
  }

  @RequirePermission('maintenance.approve')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.maintenance.approve(ctx, id, dto.note);
  }

  @RequirePermission('maintenance.manage')
  @Post(':id/items')
  addItem(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkOrderItemDto) {
    return this.maintenance.addItem(ctx, id, dto);
  }

  @RequirePermission('maintenance.manage')
  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.maintenance.removeItem(ctx, id, itemId);
  }

  @RequirePermission('maintenance.manage')
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteDto) {
    return this.maintenance.complete(ctx, id, dto);
  }

  @RequirePermission('maintenance.release')
  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  release(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.maintenance.release(ctx, id, dto.note);
  }

  @RequirePermission('maintenance.manage')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.maintenance.cancel(ctx, id, dto.reason);
  }
}

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @RequirePermission('maintenance.view')
  @Get('service-types')
  serviceTypes(@OrgCtx() ctx: OrgContext) {
    return this.maintenance.serviceTypes(ctx);
  }

  @RequirePermission('maintenance.manage')
  @Post('service-types')
  createServiceType(@OrgCtx() ctx: OrgContext, @Body() dto: ServiceTypeDto) {
    return this.maintenance.createServiceType(ctx, dto);
  }

  @RequirePermission('maintenance.manage')
  @Patch('service-types/:id')
  updateServiceType(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceTypeDto) {
    return this.maintenance.updateServiceType(ctx, id, dto);
  }

  @RequirePermission('maintenance.view')
  @Get('plans')
  plans(@OrgCtx() ctx: OrgContext, @Query() query: PlanQueryDto) {
    return this.maintenance.plans(ctx, query);
  }

  /** Planos vencendo ou vencidos, para o painel e o dashboard. */
  @RequirePermission('maintenance.view')
  @Get('plans/due')
  async due(@OrgCtx() ctx: OrgContext) {
    const all = await this.maintenance.plans(ctx, {});
    return all.filter((p) => p.active && (p.due.state === 'DUE_SOON' || p.due.state === 'OVERDUE'));
  }

  @RequirePermission('maintenance.manage')
  @Post('plans')
  createPlan(@OrgCtx() ctx: OrgContext, @Body() dto: PlanDto) {
    return this.maintenance.createPlan(ctx, dto);
  }

  @RequirePermission('maintenance.manage')
  @Patch('plans/:id')
  updatePlan(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.maintenance.updatePlan(ctx, id, dto);
  }

  @RequirePermission('maintenance.view')
  @Get('vehicles/:vehicleUnitId')
  vehicle(@OrgCtx() ctx: OrgContext, @Param('vehicleUnitId', ParseUUIDPipe) vehicleUnitId: string) {
    return this.maintenance.vehicleSummary(ctx, vehicleUnitId);
  }
}
