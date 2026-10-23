import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { ClaimsService } from './claims.service';
import {
  ClaimExpenseDto, ClaimIndemnityDto, ClaimNoteDto, ClaimQueryDto, ClaimStatusDto, CreateClaimDto, PolicyDto, PolicyVehiclesDto,
  UpdateClaimDto, UpdatePolicyDto,
} from './dto';

@Controller()
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @RequirePermission('claims.view')
  @Get('insurance/policies')
  policies(@OrgCtx() ctx: OrgContext) {
    return this.claims.policies(ctx);
  }

  @RequirePermission('claims.manage')
  @Post('insurance/policies')
  createPolicy(@OrgCtx() ctx: OrgContext, @Body() dto: PolicyDto) {
    return this.claims.createPolicy(ctx, dto);
  }

  @RequirePermission('claims.manage')
  @Patch('insurance/policies/:id')
  updatePolicy(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePolicyDto) {
    return this.claims.updatePolicy(ctx, id, dto);
  }

  @RequirePermission('claims.manage')
  @Put('insurance/policies/:id/vehicles')
  vehicles(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PolicyVehiclesDto) {
    return this.claims.setPolicyVehicles(ctx, id, dto);
  }

  @RequirePermission('claims.view')
  @Get('claims')
  list(@OrgCtx() ctx: OrgContext, @Query() query: ClaimQueryDto) {
    return this.claims.list(ctx, query);
  }

  @RequirePermission('claims.view')
  @Get('claims/:id')
  detail(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.claims.detail(ctx, id);
  }

  @RequirePermission('claims.manage')
  @Post('claims')
  create(@OrgCtx() ctx: OrgContext, @Body() dto: CreateClaimDto) {
    return this.claims.create(ctx, dto);
  }

  @RequirePermission('claims.manage')
  @Patch('claims/:id')
  update(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClaimDto) {
    return this.claims.update(ctx, id, dto);
  }

  @RequirePermission('claims.manage')
  @Post('claims/:id/status')
  @HttpCode(HttpStatus.OK)
  status(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimStatusDto) {
    return this.claims.changeStatus(ctx, id, dto);
  }

  @RequirePermission('claims.manage')
  @Post('claims/:id/notes')
  note(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimNoteDto) {
    return this.claims.addNote(ctx, id, dto);
  }

  @RequirePermission('claims.manage', 'fleet.status')
  @Post('claims/:id/block-vehicle')
  @HttpCode(HttpStatus.OK)
  block(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimNoteDto) {
    return this.claims.blockVehicle(ctx, id, dto);
  }

  @RequirePermission('claims.manage', 'finance.payables')
  @Post('claims/:id/expenses')
  expense(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimExpenseDto) {
    return this.claims.addExpense(ctx, id, dto);
  }

  @RequirePermission('claims.manage', 'finance.receivables')
  @Post('claims/:id/indemnity')
  indemnity(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimIndemnityDto) {
    return this.claims.addIndemnity(ctx, id, dto);
  }
}
