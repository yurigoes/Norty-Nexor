import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { InfractionsService } from './infractions.service';
import {
  AppealDto, AppealResultDto, ChargeInfractionDto, CreateInfractionDto, IndicateDriverDto, InfractionQueryDto,
  InfractionStatusDto, PayInfractionDto, UpdateInfractionDto,
} from './dto';

@Controller('infractions')
export class InfractionsController {
  constructor(private readonly infractions: InfractionsService) {}

  @RequirePermission('infractions.view')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() query: InfractionQueryDto) {
    return this.infractions.list(ctx, query);
  }

  @RequirePermission('infractions.view')
  @Get(':id')
  detail(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.infractions.detail(ctx, id);
  }

  @RequirePermission('infractions.manage')
  @Post()
  create(@OrgCtx() ctx: OrgContext, @Body() dto: CreateInfractionDto) {
    return this.infractions.create(ctx, dto);
  }

  @RequirePermission('infractions.manage')
  @Patch(':id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInfractionDto) {
    return this.infractions.update(ctx, id, dto);
  }

  @RequirePermission('infractions.manage')
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  status(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InfractionStatusDto) {
    return this.infractions.changeStatus(ctx, id, dto);
  }

  @RequirePermission('infractions.view')
  @Get(':id/driver-suggestion')
  suggestion(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.infractions.driverSuggestion(ctx, id);
  }

  /** Indicação do condutor: ato explícito, com permissão própria. Nunca automático. */
  @RequirePermission('infractions.indicate_driver')
  @Post(':id/indicate-driver')
  @HttpCode(HttpStatus.OK)
  indicate(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IndicateDriverDto) {
    return this.infractions.indicateDriver(ctx, id, dto);
  }

  @RequirePermission('infractions.manage', 'finance.payables')
  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  pay(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayInfractionDto) {
    return this.infractions.payByCompany(ctx, id, dto);
  }

  @RequirePermission('infractions.manage', 'finance.receivables')
  @Post(':id/charge')
  @HttpCode(HttpStatus.OK)
  charge(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChargeInfractionDto) {
    return this.infractions.chargeCustomer(ctx, id, dto);
  }

  @RequirePermission('infractions.manage')
  @Post(':id/appeal')
  @HttpCode(HttpStatus.OK)
  appeal(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AppealDto) {
    return this.infractions.appeal(ctx, id, dto);
  }

  @RequirePermission('infractions.manage')
  @Post(':id/appeal-result')
  @HttpCode(HttpStatus.OK)
  appealResult(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AppealResultDto) {
    return this.infractions.appealResult(ctx, id, dto);
  }
}
