import { Body, Controller, Get, Header, HttpCode, HttpStatus, Module, Param, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { DepositsModule } from '../deposits/deposits';
import { ContractsService } from './contracts.service';
import { generateDueInstallments } from './rentals.jobs';
import {
  ActivateDto, AmendDto, CloseDto, ContractQueryDto, CreateContractDto, ExtendDto, GenerateBillingDto, ReasonDto, RenewDto, SignatureDto,
  SwapDriverDto, SwapVehicleDto, TerminateDto,
} from './dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService, private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @RequirePermission('contracts.view')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query() q: ContractQueryDto) {
    return this.contracts.list(ctx, q);
  }

  @RequirePermission('contracts.create')
  @Post()
  create(@OrgCtx() ctx: OrgContext, @Body() dto: CreateContractDto) {
    return this.contracts.create(ctx, dto);
  }

  /** Geração manual das mensalidades (a rotina agendada faz o mesmo todo dia). */
  @RequirePermission('finance.receivables')
  @Post('billing/generate')
  @HttpCode(HttpStatus.OK)
  async generate(@OrgCtx() ctx: OrgContext, @Body() dto: GenerateBillingDto) {
    const created = await this.prisma.tenant(ctx, async (tx) => {
      const n = await generateDueInstallments(tx, ctx.organizationId, dto.horizonDays ?? 35);
      await this.audit.record(tx, ctx, { action: 'contract.billing_generated', entityType: 'RentalContract', after: { created: n, horizonDays: dto.horizonDays ?? 35 } });
      return n;
    });
    return { created };
  }

  @RequirePermission('contracts.view')
  @Get(':id')
  detail(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.detail(ctx, id);
  }

  @RequirePermission('contracts.view')
  @Get(':id/versions/:version')
  version(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Param('version', ParseIntPipe) version: number) {
    return this.contracts.version(ctx, id, version);
  }

  @RequirePermission('contracts.view')
  @Get(':id/inspections')
  inspections(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.inspections(ctx, id);
  }

  /** HTML imprimível: o navegador salva em PDF. */
  @RequirePermission('contracts.view')
  @Get(':id/document')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  document(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.document(ctx, id);
  }

  @RequirePermission('contracts.edit')
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.submit(ctx, id);
  }

  @RequirePermission('contracts.approve')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.approve(ctx, id);
  }

  @RequirePermission('contracts.edit')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.contracts.cancel(ctx, id, dto.reason);
  }

  @RequirePermission('contracts.edit')
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActivateDto) {
    return this.contracts.activate(ctx, id, dto);
  }

  @RequirePermission('contracts.edit')
  @Post(':id/swap-driver')
  @HttpCode(HttpStatus.OK)
  swapDriver(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SwapDriverDto) {
    return this.contracts.swapDriver(ctx, id, dto);
  }

  @RequirePermission('contracts.edit')
  @Post(':id/swap-vehicle')
  @HttpCode(HttpStatus.OK)
  swapVehicle(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SwapVehicleDto) {
    return this.contracts.swapVehicle(ctx, id, dto);
  }

  @RequirePermission('contracts.edit')
  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  extend(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendDto) {
    return this.contracts.extend(ctx, id, dto);
  }

  @RequirePermission('contracts.edit')
  @Post(':id/amend')
  @HttpCode(HttpStatus.OK)
  amend(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AmendDto) {
    return this.contracts.amend(ctx, id, dto);
  }

  @RequirePermission('contracts.create')
  @Post(':id/renew')
  renew(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RenewDto) {
    return this.contracts.renew(ctx, id, dto);
  }

  @RequirePermission('contracts.close')
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseDto) {
    return this.contracts.close(ctx, id, dto);
  }

  @RequirePermission('contracts.close')
  @Post(':id/terminate')
  @HttpCode(HttpStatus.OK)
  terminate(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TerminateDto) {
    return this.contracts.terminate(ctx, id, dto);
  }

  @RequirePermission('contracts.edit')
  @Post(':id/signature/physical')
  @HttpCode(HttpStatus.OK)
  signPhysical(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignatureDto) {
    return this.contracts.signPhysical(ctx, id, dto.fileId);
  }

  @RequirePermission('contracts.edit')
  @Post(':id/signature/electronic')
  signElectronic() {
    return this.contracts.signElectronic();
  }
}

@Module({ imports: [DepositsModule], controllers: [ContractsController], providers: [ContractsService], exports: [ContractsService] })
export class ContractsModule {}
