import { Controller, Get, Global, Module, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { ProfitabilityService } from './profitability.service';

class PeriodDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

@Controller('profitability')
export class ProfitabilityController {
  constructor(private readonly profitability: ProfitabilityService) {}

  @RequirePermission('reports.financial')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() query: PeriodDto) {
    return this.profitability.list(ctx, query);
  }

  @RequirePermission('reports.financial')
  @Get(':vehicleId')
  vehicle(@OrgCtx() ctx: OrgContext, @Param('vehicleId', ParseUUIDPipe) id: string, @Query() query: PeriodDto) {
    return this.profitability.vehicle(ctx, id, query);
  }
}

/** Global: dashboard, relatórios e Norty IA usam o mesmo cálculo. */
@Global()
@Module({ controllers: [ProfitabilityController], providers: [ProfitabilityService], exports: [ProfitabilityService] })
export class ProfitabilityModule {}
