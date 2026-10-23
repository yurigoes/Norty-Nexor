import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ContextKinds, Ctx, RequirePermission, type RequestContext } from '../../common/context';
import { DomainsService } from '../domains/domains.service';
import { PlatformService } from './platform.service';
import {
  CreateOrganizationDto, GenerateInvoicesDto, GrantRequestDto, ListQueryDto, PayInvoiceDto, PlanDto, ReasonDto, SettingDto,
  StaffDto, StatusChangeDto, SubscriptionDto, TicketUpdateDto, UpdateOrganizationAdminDto, UpdatePlanDto, UpdateStaffDto,
} from './dto';

/** Master Norty. Só o contexto PLATFORM entra; cada rota exige a permissão de plataforma. */
@ContextKinds('PLATFORM')
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService, private readonly domains: DomainsService) {}

  @RequirePermission('platform.orgs.view')
  @Get('dashboard')
  dashboard() {
    return this.platform.dashboard();
  }

  @RequirePermission('platform.orgs.view')
  @Get('organizations')
  organizations(@Query() query: ListQueryDto) {
    return this.platform.organizations(query);
  }

  @RequirePermission('platform.orgs.view')
  @Get('organizations/:id')
  organization(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.organization(id);
  }

  @RequirePermission('platform.orgs.manage')
  @Post('organizations')
  create(@Ctx() ctx: RequestContext, @Body() dto: CreateOrganizationDto) {
    return this.platform.createOrganization(ctx, dto);
  }

  @RequirePermission('platform.orgs.manage')
  @Patch('organizations/:id')
  update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrganizationAdminDto) {
    return this.platform.updateOrganization(ctx, id, dto);
  }

  @RequirePermission('platform.orgs.manage')
  @Post('organizations/:id/status')
  @HttpCode(HttpStatus.OK)
  status(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusChangeDto) {
    return this.platform.changeStatus(ctx, id, dto.status, dto.reason);
  }

  @RequirePermission('platform.billing.manage')
  @Patch('organizations/:id/subscription')
  subscription(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubscriptionDto) {
    return this.platform.updateSubscription(ctx, id, dto);
  }

  @RequirePermission('platform.orgs.view')
  @Get('plans')
  plans() {
    return this.platform.plans();
  }

  @RequirePermission('platform.plans.manage')
  @Post('plans')
  createPlan(@Ctx() ctx: RequestContext, @Body() dto: PlanDto) {
    return this.platform.createPlan(ctx, dto);
  }

  @RequirePermission('platform.plans.manage')
  @Patch('plans/:id')
  updatePlan(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.platform.updatePlan(ctx, id, dto);
  }

  @RequirePermission('platform.billing.manage')
  @Get('invoices')
  invoices(@Query() query: ListQueryDto) {
    return this.platform.invoices(query);
  }

  @RequirePermission('platform.billing.manage')
  @Post('invoices/generate')
  generate(@Ctx() ctx: RequestContext, @Body() dto: GenerateInvoicesDto) {
    return this.platform.generateInvoices(ctx, dto);
  }

  @RequirePermission('platform.billing.manage')
  @Post('invoices/:id/pay')
  @HttpCode(HttpStatus.OK)
  pay(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayInvoiceDto) {
    return this.platform.payInvoice(ctx, id, dto.reference);
  }

  @RequirePermission('platform.billing.manage')
  @Post('invoices/:id/void')
  @HttpCode(HttpStatus.OK)
  void(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.platform.voidInvoice(ctx, id, dto.reason);
  }

  @RequirePermission('platform.domains.manage')
  @Get('domains')
  allDomains(@Query('status') status?: string) {
    return this.domains.allDomains(status || undefined);
  }

  @RequirePermission('platform.domains.manage')
  @Post('domains/:id/verify')
  @HttpCode(HttpStatus.OK)
  verifyDomain(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.domains.verify(ctx, id);
  }

  @RequirePermission('platform.domains.manage')
  @Delete('domains/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDomain(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.domains.remove(ctx, id, dto.reason);
  }

  @RequirePermission('platform.support')
  @Get('tickets')
  tickets(@Query('status') status?: string) {
    return this.platform.tickets(status || undefined);
  }

  @RequirePermission('platform.support')
  @Patch('tickets/:id')
  updateTicket(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TicketUpdateDto) {
    return this.platform.updateTicket(ctx, id, dto);
  }

  @RequirePermission('platform.support')
  @Get('support-grants')
  myGrants(@Ctx() ctx: RequestContext) {
    return this.platform.myGrants(ctx);
  }

  @RequirePermission('platform.support')
  @Post('support-grants')
  requestGrant(@Ctx() ctx: RequestContext, @Body() dto: GrantRequestDto) {
    return this.platform.requestGrant(ctx, dto);
  }

  @RequirePermission('platform.health.view')
  @Get('health')
  health() {
    return this.platform.health();
  }

  @RequirePermission('platform.audit.view')
  @Get('audit')
  audit(@Query() query: ListQueryDto) {
    return this.platform.platformAudit(query);
  }

  @RequirePermission('platform.staff.manage')
  @Get('staff')
  staff() {
    return this.platform.staff();
  }

  @RequirePermission('platform.staff.manage')
  @Post('staff')
  createStaff(@Ctx() ctx: RequestContext, @Body() dto: StaffDto) {
    return this.platform.createStaff(ctx, dto);
  }

  @RequirePermission('platform.staff.manage')
  @Patch('staff/:id')
  updateStaff(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.platform.updateStaff(ctx, id, dto);
  }

  @RequirePermission('platform.settings.manage')
  @Get('settings')
  settings() {
    return this.platform.settings();
  }

  @RequirePermission('platform.settings.manage')
  @Put('settings')
  saveSetting(@Ctx() ctx: RequestContext, @Body() dto: SettingDto) {
    return this.platform.saveSetting(ctx, dto.key, dto.value);
  }

  @RequirePermission('platform.integrations.manage')
  @Get('integrations')
  integrations(@Query('test') test?: string) {
    return this.platform.integrations(test === 'true');
  }
}
