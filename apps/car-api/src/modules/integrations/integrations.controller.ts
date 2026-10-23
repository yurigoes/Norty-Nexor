import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards,
  createParamDecorator, type ExecutionContext,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { formatPlate } from '@nortycar/shared';
import { OrgCtx, Public, RequirePermission, type OrgContext } from '../../common/context';
import { PrismaService } from '../../common/prisma.service';
import { AvailabilityService } from '../../common/availability.service';
import { AuditService } from '../../common/audit.service';
import { pageArgs, paginated } from '../../common/pagination';
import { API_SCOPES, IntegrationsService } from './integrations.service';
import { ApiKeyGuard, RequireScope, type IntegrationContext } from './api-key.guard';

class ApiKeyDto {
  @IsString() @Length(2, 80) name!: string;
  @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) scopes!: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}

class WebhookDto {
  @IsString() @MaxLength(500) url!: string;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) events!: string[];
}

class UpdateWebhookDto {
  @IsOptional() @IsString() @MaxLength(500) url?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) events?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

class PaymentProviderDto {
  @IsString() @Matches(/^[a-z0-9-]{2,30}$/, { message: 'Nome do provedor: letras minúsculas, números ou hífen (ex.: asaas, pagarme).' }) name!: string;
  @IsString() @Length(16, 300) webhookSecret!: string;
}

class IntegrationQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsIn(['REQUESTED', 'CONFIRMED', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'EXPIRED']) status?: string;
}

function apiPublicUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}/v1`;
}

/** Painel de integrações da empresa. */
@RequirePermission('integrations.manage')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('scopes')
  scopes() {
    return Object.entries(API_SCOPES).map(([key, label]) => ({ key, label }));
  }

  @Get('api-keys')
  apiKeys(@OrgCtx() ctx: OrgContext) {
    return this.integrations.apiKeys(ctx);
  }

  @Post('api-keys')
  createApiKey(@OrgCtx() ctx: OrgContext, @Body() dto: ApiKeyDto) {
    return this.integrations.createApiKey(ctx, dto.name, dto.scopes, dto.expiresAt);
  }

  @Delete('api-keys/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeApiKey(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrations.revokeApiKey(ctx, id);
  }

  @Get('webhooks')
  webhooks(@OrgCtx() ctx: OrgContext) {
    return this.integrations.webhooks(ctx);
  }

  @Post('webhooks')
  createWebhook(@OrgCtx() ctx: OrgContext, @Body() dto: WebhookDto) {
    return this.integrations.createWebhook(ctx, dto.url, dto.events);
  }

  @Patch('webhooks/:id')
  updateWebhook(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWebhookDto) {
    return this.integrations.updateWebhook(ctx, id, dto);
  }

  @Delete('webhooks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteWebhook(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrations.deleteWebhook(ctx, id);
  }

  @Post('webhooks/:id/test')
  @HttpCode(HttpStatus.OK)
  testWebhook(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrations.testWebhook(ctx, id);
  }

  @Get('providers')
  providers(@OrgCtx() ctx: OrgContext, @Req() req: Request) {
    return this.integrations.providers(ctx, apiPublicUrl(req));
  }

  @Put('providers/payment')
  savePayment(@OrgCtx() ctx: OrgContext, @Body() dto: PaymentProviderDto) {
    return this.integrations.savePaymentProvider(ctx, dto.name, dto.webhookSecret);
  }

  @Delete('providers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeProvider(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrations.removeProvider(ctx, id);
  }
}

const Integration = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().integration as IntegrationContext);

/**
 * API de integração (somente leitura), autenticada por chave de API e não
 * pelo login. Cada chamada fica na trilha da empresa.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('integration')
export class IntegrationApiController {
  constructor(private readonly prisma: PrismaService, private readonly availability: AvailabilityService, private readonly audit: AuditService) {}

  private async log(integration: IntegrationContext, action: string, req: Request) {
    await this.prisma.tenant({ organizationId: integration.organizationId }, (tx) => tx.auditLog.create({
      data: {
        organizationId: integration.organizationId, actorType: 'INTEGRATION', actorName: `Chave ${integration.prefix}`, action, entityType: 'ApiKey',
        entityId: integration.apiKeyId, ip: req.ip ?? null, requestId: (req.headers['x-request-id'] as string) ?? null,
      },
    }));
  }

  @RequireScope('vehicles:read')
  @Get('vehicles')
  async vehicles(@Integration() integration: IntegrationContext, @Query() q: IntegrationQuery, @Req() req: Request) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = { deletedAt: null, commercialStatus: { not: 'SOLD' as const }, ...(q.branchId ? { branchId: q.branchId } : {}), ...(q.categoryId ? { categoryId: q.categoryId } : {}) };
    const [rows, total] = await this.prisma.tenant({ organizationId: integration.organizationId }, (tx) => Promise.all([
      tx.vehicleUnit.findMany({ where, skip, take, orderBy: { internalCode: 'asc' }, include: { model: { include: { make: true } }, category: true, version: true } }),
      tx.vehicleUnit.count({ where }),
    ]));
    await this.log(integration, 'integration.vehicles_read', req);
    return paginated(rows.map((v) => ({
      id: v.id, internalCode: v.internalCode, plate: formatPlate(v.plate), make: v.model.make.name, model: v.model.name, version: v.version?.name ?? null,
      category: v.category.name, yearManufacture: v.yearManufacture, yearModel: v.yearModel, color: v.color, fuel: v.fuel, transmission: v.transmission,
      odometerKm: v.odometerKm, branchId: v.branchId, commercialStatus: v.commercialStatus, operationalStatus: v.operationalStatus,
    })), total, page, pageSize);
  }

  @RequireScope('availability:read')
  @Get('availability')
  async availabilityQuery(@Integration() integration: IntegrationContext, @Query() q: IntegrationQuery, @Req() req: Request) {
    if (!q.startAt || !q.endAt) throw new BadRequestException('Informe startAt e endAt.');
    const units = await this.prisma.tenant({ organizationId: integration.organizationId }, (tx) =>
      this.availability.findAvailable(tx, integration.organizationId, { startAt: new Date(q.startAt!), endAt: new Date(q.endAt!), branchId: q.branchId, categoryId: q.categoryId }));
    await this.log(integration, 'integration.availability_read', req);
    return units.map((u) => ({ id: u.id, plate: formatPlate(u.plate), make: u.model.make.name, model: u.model.name, category: u.category.name, color: u.color, branchId: u.branchId }));
  }

  @RequireScope('reservations:read')
  @Get('reservations')
  async reservations(@Integration() integration: IntegrationContext, @Query() q: IntegrationQuery, @Req() req: Request) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.startAt || q.endAt ? { startAt: { ...(q.startAt ? { gte: new Date(q.startAt) } : {}), ...(q.endAt ? { lte: new Date(q.endAt) } : {}) } } : {}),
    };
    const [rows, total] = await this.prisma.tenant({ organizationId: integration.organizationId }, (tx) => Promise.all([
      tx.reservation.findMany({ where, skip, take, orderBy: { startAt: 'asc' }, include: { customer: { select: { name: true } }, category: { select: { name: true } }, vehicle: { select: { plate: true } } } }),
      tx.reservation.count({ where }),
    ]));
    await this.log(integration, 'integration.reservations_read', req);
    return paginated(rows.map((r) => ({
      id: r.id, code: r.code, status: r.status, branchId: r.branchId, startAt: r.startAt, endAt: r.endAt, category: r.category.name,
      vehiclePlate: r.vehicle ? formatPlate(r.vehicle.plate) : null, customerName: r.customer.name, total: r.total, source: r.source,
    })), total, page, pageSize);
  }
}
