import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { SalesService } from './sales.service';
import { CloseSaleDto, CreateSaleDto, ProposalDto, ProposalStatusDto, SaleExpenseDto, SaleQueryDto, UpdateSaleDto, WithdrawSaleDto } from './dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @RequirePermission('sales.view')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() query: SaleQueryDto) {
    return this.sales.list(ctx, query);
  }

  @RequirePermission('sales.view')
  @Get(':id')
  detail(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sales.detail(ctx, id);
  }

  @RequirePermission('sales.manage')
  @Post()
  create(@OrgCtx() ctx: OrgContext, @Body() dto: CreateSaleDto) {
    return this.sales.create(ctx, dto);
  }

  @RequirePermission('sales.manage')
  @Patch(':id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSaleDto) {
    return this.sales.update(ctx, id, dto);
  }

  @RequirePermission('sales.manage')
  @Post(':id/proposals')
  proposal(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProposalDto) {
    return this.sales.addProposal(ctx, id, dto);
  }

  @RequirePermission('sales.manage')
  @Post(':id/proposals/:proposalId/status')
  @HttpCode(HttpStatus.OK)
  proposalStatus(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Param('proposalId', ParseUUIDPipe) proposalId: string, @Body() dto: ProposalStatusDto) {
    return this.sales.setProposalStatus(ctx, id, proposalId, dto);
  }

  @RequirePermission('sales.manage', 'finance.payables')
  @Post(':id/expenses')
  expense(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaleExpenseDto) {
    return this.sales.addExpense(ctx, id, dto);
  }

  @RequirePermission('sales.manage')
  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawSaleDto) {
    return this.sales.withdraw(ctx, id, dto);
  }

  @RequirePermission('sales.close')
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseSaleDto) {
    return this.sales.close(ctx, id, dto);
  }
}
