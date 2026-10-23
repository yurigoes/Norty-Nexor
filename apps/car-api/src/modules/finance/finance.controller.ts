import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { FinanceService } from './finance.service';
import {
  CostCenterDto, CreatePayableDto, CreateReceivableDto, PaymentDto, PaymentQueryDto, PeriodQueryDto, ReasonDto, ReconcileDto,
  TitleQueryDto, UpdateCostCenterDto,
} from './dto';

@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  /* ---------- Contas a receber ---------- */

  @RequirePermission('finance.view')
  @Get('receivables')
  receivables(@OrgCtx() ctx: OrgContext, @Query() q: TitleQueryDto) {
    return this.finance.receivables(ctx, q);
  }

  @RequirePermission('finance.view')
  @Get('receivables/:id')
  receivable(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.receivable(ctx, id);
  }

  @RequirePermission('finance.receivables')
  @Post('receivables')
  createReceivable(@OrgCtx() ctx: OrgContext, @Body() dto: CreateReceivableDto) {
    return this.finance.createReceivable(ctx, dto);
  }

  @RequirePermission('finance.receivables')
  @Post('receivables/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelReceivable(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.finance.cancelReceivable(ctx, id, dto.reason);
  }

  @RequirePermission('finance.settle')
  @Post('receivables/:id/payments')
  payReceivable(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto) {
    return this.finance.settle(ctx, 'receivable', id, dto);
  }

  /* ---------- Contas a pagar ---------- */

  @RequirePermission('finance.view')
  @Get('payables')
  payables(@OrgCtx() ctx: OrgContext, @Query() q: TitleQueryDto) {
    return this.finance.payables(ctx, q);
  }

  @RequirePermission('finance.view')
  @Get('payables/:id')
  payable(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.payable(ctx, id);
  }

  @RequirePermission('finance.payables')
  @Post('payables')
  createPayable(@OrgCtx() ctx: OrgContext, @Body() dto: CreatePayableDto) {
    return this.finance.createPayable(ctx, dto);
  }

  @RequirePermission('finance.approve')
  @Post('payables/:id/approve')
  @HttpCode(HttpStatus.OK)
  approvePayable(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.decidePayable(ctx, id, 'APPROVED');
  }

  @RequirePermission('finance.approve')
  @Post('payables/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectPayable(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.finance.decidePayable(ctx, id, 'REJECTED', dto.reason);
  }

  @RequirePermission('finance.payables')
  @Post('payables/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelPayable(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.finance.cancelPayable(ctx, id, dto.reason);
  }

  @RequirePermission('finance.settle')
  @Post('payables/:id/payments')
  payPayable(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto) {
    return this.finance.settle(ctx, 'payable', id, dto);
  }

  /* ---------- Pagamentos e conciliação ---------- */

  @RequirePermission('finance.view')
  @Get('payments')
  payments(@OrgCtx() ctx: OrgContext, @Query() q: PaymentQueryDto) {
    return this.finance.payments(ctx, q);
  }

  @RequirePermission('finance.settle')
  @Post('payments/:id/reverse')
  @HttpCode(HttpStatus.OK)
  reverse(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.finance.reversePayment(ctx, id, dto.reason);
  }

  @RequirePermission('finance.reconcile')
  @Post('payments/:id/reconcile')
  @HttpCode(HttpStatus.OK)
  reconcile(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReconcileDto) {
    return this.finance.reconcile(ctx, id, true, dto.bankReference);
  }

  @RequirePermission('finance.reconcile')
  @Post('payments/:id/unreconcile')
  @HttpCode(HttpStatus.OK)
  unreconcile(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.reconcile(ctx, id, false);
  }

  /* ---------- Centros de custo ---------- */

  @Get('cost-centers')
  costCenters(@OrgCtx() ctx: OrgContext) {
    return this.finance.costCenters(ctx);
  }

  @RequirePermission('finance.payables')
  @Post('cost-centers')
  createCostCenter(@OrgCtx() ctx: OrgContext, @Body() dto: CostCenterDto) {
    return this.finance.createCostCenter(ctx, dto);
  }

  @RequirePermission('finance.payables')
  @Patch('cost-centers/:id')
  updateCostCenter(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCostCenterDto) {
    return this.finance.updateCostCenter(ctx, id, dto);
  }

  /* ---------- Indicadores ---------- */

  @RequirePermission('finance.view')
  @Get('finance/summary')
  summary(@OrgCtx() ctx: OrgContext, @Query() q: PeriodQueryDto) {
    return this.finance.summary(ctx, q);
  }

  @RequirePermission('finance.view')
  @Get('finance/cashflow')
  cashflow(@OrgCtx() ctx: OrgContext, @Query() q: PeriodQueryDto) {
    return this.finance.cashflow(ctx, q);
  }
}
