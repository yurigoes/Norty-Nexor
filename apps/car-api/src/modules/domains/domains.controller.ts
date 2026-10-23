import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';
import { OrgCtx, Public, RequirePermission, type OrgContext } from '../../common/context';
import { DomainsService } from './domains.service';

class AddDomainDto {
  @IsString() @Length(4, 253) hostname!: string;
}

class RemoveDomainDto {
  @IsString() @Length(3, 500) reason!: string;
}

@Controller()
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @RequirePermission('domains.manage')
  @Get('domains')
  list(@OrgCtx() ctx: OrgContext) {
    return this.domains.list(ctx);
  }

  @RequirePermission('domains.manage')
  @Post('domains')
  add(@OrgCtx() ctx: OrgContext, @Body() dto: AddDomainDto) {
    return this.domains.add(ctx, dto.hostname);
  }

  @RequirePermission('domains.manage')
  @Post('domains/:id/verify')
  @HttpCode(HttpStatus.OK)
  verify(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.domains.verify(ctx, id, ctx.organizationId);
  }

  @RequirePermission('domains.manage')
  @Post('domains/:id/primary')
  @HttpCode(HttpStatus.OK)
  primary(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.domains.setPrimary(ctx, id);
  }

  @RequirePermission('domains.manage')
  @Delete('domains/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RemoveDomainDto) {
    return this.domains.remove(ctx, id, dto.reason, ctx.organizationId);
  }

  /**
   * Endpoint do `on_demand_tls { ask … }` do Caddy: 200 autoriza emitir o
   * certificado; qualquer outra resposta recusa. Impede que alguém aponte
   * um domínio qualquer para nós e nos faça pedir certificados em massa.
   */
  @Public()
  @SkipThrottle()
  @Get('public/domains/tls-ask')
  async tlsAsk(@Query('domain') domain: string) {
    if (!(await this.domains.tlsAllowed(domain ?? ''))) throw new NotFoundException('Domínio não autorizado.');
    return { ok: true };
  }
}
