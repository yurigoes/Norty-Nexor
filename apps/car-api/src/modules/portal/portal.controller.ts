import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import type { ServiceRequestType } from '@nortycar/shared';
import { ContextKinds, OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { PortalService } from './portal.service';

const REQUEST_TYPES = ['MAINTENANCE', 'ASSISTANCE', 'VEHICLE_SWAP', 'RENEWAL', 'TERMINATION', 'DATA_CORRECTION', 'DATA_ACCESS', 'OTHER'] as const;

class CreateRequestDto {
  @IsIn(REQUEST_TYPES) type!: ServiceRequestType;
  @IsString() @Length(3, 160) subject!: string;
  @IsString() @Length(3, 5000) description!: string;
  @IsOptional() @IsUUID() contractId?: string;
}

class MessageDto {
  @IsString() @Length(1, 5000) body!: string;
}

class StaffReplyDto {
  @IsString() @Length(1, 5000) body!: string;
  @IsOptional() @IsBoolean() close?: boolean;
}

class StaffStatusDto {
  @IsIn(['IN_PROGRESS', 'CLOSED']) status!: 'IN_PROGRESS' | 'CLOSED';
}

class RevokeDto {
  @IsOptional() @IsString() @Length(3, 500) reason?: string;
}

/** Portal do cliente: só o contexto CUSTOMER entra. */
@ContextKinds('CUSTOMER')
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('me')
  me(@OrgCtx() ctx: OrgContext) {
    return this.portal.me(ctx);
  }

  @Get('overview')
  overview(@OrgCtx() ctx: OrgContext) {
    return this.portal.overview(ctx);
  }

  @Get('contracts')
  contracts(@OrgCtx() ctx: OrgContext) {
    return this.portal.contracts(ctx);
  }

  @Get('contracts/:id')
  contract(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.contract(ctx, id);
  }

  @Get('finance')
  finance(@OrgCtx() ctx: OrgContext) {
    return this.portal.finance(ctx);
  }

  @Get('payments/:id/receipt')
  @Header('Content-Type', 'text/html; charset=utf-8')
  receipt(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.receipt(ctx, id);
  }

  @Get('infractions')
  infractions(@OrgCtx() ctx: OrgContext) {
    return this.portal.infractions(ctx);
  }

  @Get('inspections')
  inspections(@OrgCtx() ctx: OrgContext) {
    return this.portal.inspections(ctx);
  }

  @Get('documents')
  documents(@OrgCtx() ctx: OrgContext) {
    return this.portal.documents(ctx);
  }

  @Get('requests')
  requests(@OrgCtx() ctx: OrgContext) {
    return this.portal.requests(ctx);
  }

  @Post('requests')
  createRequest(@OrgCtx() ctx: OrgContext, @Body() dto: CreateRequestDto) {
    return this.portal.createRequest(ctx, dto);
  }

  @Post('requests/:id/messages')
  message(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MessageDto) {
    return this.portal.customerMessage(ctx, id, dto.body);
  }
}

/** Atendimento das solicitações do portal pela equipe da locadora. */
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(private readonly portal: PortalService) {}

  @RequirePermission('portal.manage')
  @Get()
  list(@OrgCtx() ctx: OrgContext, @Query('status') status?: string) {
    return this.portal.staffRequests(ctx, status || undefined);
  }

  @RequirePermission('portal.manage')
  @Post(':id/messages')
  reply(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffReplyDto) {
    return this.portal.staffReply(ctx, id, dto.body, dto.close ?? false);
  }

  @RequirePermission('portal.manage')
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  status(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffStatusDto) {
    return this.portal.staffStatus(ctx, id, dto.status);
  }
}

/** Liberação e revogação do portal a partir da ficha do cliente. */
@Controller('portal-access/customers')
export class PortalAccessController {
  constructor(private readonly portal: PortalService) {}

  @RequirePermission('customers.view')
  @Get(':customerId')
  status(@OrgCtx() ctx: OrgContext, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.portal.accessStatus(ctx, customerId);
  }

  @RequirePermission('customers.edit')
  @Post(':customerId')
  grant(@OrgCtx() ctx: OrgContext, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.portal.grantAccess(ctx, customerId);
  }

  @RequirePermission('customers.edit')
  @Delete(':customerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@OrgCtx() ctx: OrgContext, @Param('customerId', ParseUUIDPipe) customerId: string, @Body() dto: RevokeDto) {
    return this.portal.revokeAccess(ctx, customerId, dto?.reason);
  }
}
