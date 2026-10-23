import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { PrismaService } from '../../common/prisma.service';
import { PricingService } from './pricing.service';
import { ExtraServiceDto, QuoteDto, RateTableDto, UpdateExtraServiceDto, UpdateRateTableDto } from './dto';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService, private readonly prisma: PrismaService) {}

  @RequirePermission('reservations.view')
  @Get('rates')
  rates(@OrgCtx() ctx: OrgContext) {
    return this.pricing.rates(ctx);
  }

  @RequirePermission('pricing.manage')
  @Post('rates')
  createRate(@OrgCtx() ctx: OrgContext, @Body() dto: RateTableDto) {
    return this.pricing.createRate(ctx, dto);
  }

  @RequirePermission('pricing.manage')
  @Patch('rates/:id')
  updateRate(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRateTableDto) {
    return this.pricing.updateRate(ctx, id, dto);
  }

  @RequirePermission('reservations.view')
  @Get('extras')
  extras(@OrgCtx() ctx: OrgContext) {
    return this.pricing.extras(ctx);
  }

  @RequirePermission('pricing.manage')
  @Post('extras')
  createExtra(@OrgCtx() ctx: OrgContext, @Body() dto: ExtraServiceDto) {
    return this.pricing.createExtra(ctx, dto);
  }

  @RequirePermission('pricing.manage')
  @Patch('extras/:id')
  updateExtra(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExtraServiceDto) {
    return this.pricing.updateExtra(ctx, id, dto);
  }

  /** Cotação calculada no servidor. É só uma simulação: não reserva nada. */
  @RequirePermission('reservations.create')
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  quote(@OrgCtx() ctx: OrgContext, @Body() dto: QuoteDto) {
    return this.prisma.tenant(ctx, (tx) => this.pricing.quote(tx, ctx.organizationId, {
      ...dto, startAt: new Date(dto.startAt), endAt: new Date(dto.endAt),
    }));
  }
}
