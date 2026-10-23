import {
  Body, Controller, Get, Header, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength,
  Min, ValidateNested,
} from 'class-validator';
import type { Request, Response } from 'express';
import type { LeadKind } from '@nortycar/shared';
import { OrgCtx, Public, RequirePermission, type OrgContext } from '../../common/context';
import { FilesService } from '../files/files.service';
import { send } from '../files/files.controller';
import { loadConfig } from '../../config/env';
import { PublicSiteService } from './public-site.service';
import { SiteAdminService } from './site-admin.service';

const SLUG = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

class PeriodQuery {
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

class QuoteExtraDto {
  @IsUUID() extraServiceId!: string;
  @IsInt() @Min(1) @Max(10) quantity!: number;
}

class PublicQuoteDto {
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => QuoteExtraDto) extras?: QuoteExtraDto[];
  @IsOptional() @IsInt() @Min(0) @Max(3) additionalDrivers?: number;
}

class PublicLeadDto {
  @IsIn(['QUOTE', 'CONTACT', 'MONTHLY', 'RESERVATION_REQUEST']) kind!: LeadKind;
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() modelId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsBoolean() consent!: boolean;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}

class FaqDto {
  @IsString() @Length(2, 300) question!: string;
  @IsString() @Length(2, 3000) answer!: string;
}

class SiteConfigDto {
  @IsOptional() @IsString() @Length(2, 80) brandName?: string;
  @IsOptional() @IsUUID() logoFileId?: string | null;
  @IsOptional() @IsUUID() bannerFileId?: string | null;
  @IsOptional() @Matches(COLOR, { message: 'Cor no formato #RRGGBB.' }) primaryColor?: string;
  @IsOptional() @Matches(COLOR, { message: 'Cor no formato #RRGGBB.' }) accentColor?: string;
  @IsOptional() @IsString() @MaxLength(120) heroTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(300) heroSubtitle?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) about?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => FaqDto) faq?: FaqDto[];
  @IsOptional() @IsString() @MaxLength(30000) terms?: string | null;
  @IsOptional() @IsString() @MaxLength(30000) privacy?: string | null;
  @IsOptional() @IsString() @MaxLength(30) whatsapp?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) citiesServed?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsUUID('all', { each: true }) featuredModelIds?: string[];
  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(170) seoDescription?: string | null;
}

class PublishDto {
  @IsBoolean() published!: boolean;
}

class LeadStatusDto {
  @IsIn(['NEW', 'IN_PROGRESS', 'DISCARDED']) status!: 'NEW' | 'IN_PROGRESS' | 'DISCARDED';
  @IsOptional() @IsString() @Length(3, 500) reason?: string;
}

class LeadQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(20) status?: string;
  @IsOptional() @IsString() @MaxLength(30) kind?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}

function slugOf(raw: string): string {
  if (!SLUG.test(raw ?? '')) throw new NotFoundException('Site não encontrado.');
  return raw;
}

/** Endpoints anônimos do site público, com limite por IP. */
@Public()
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('public/sites')
export class PublicSiteController {
  constructor(private readonly site: PublicSiteService, private readonly files: FilesService) {}

  @Get('resolve')
  resolve(@Query('host') host: string) {
    return this.site.resolveHost(host ?? '');
  }

  @Get(':slug')
  home(@Param('slug') slug: string) {
    return this.site.home(slugOf(slug));
  }

  @Get(':slug/models')
  models(@Param('slug') slug: string, @Query() q: PeriodQuery) {
    return this.site.models(slugOf(slug), q);
  }

  @Get(':slug/models/:id')
  model(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Query() q: PeriodQuery) {
    return this.site.model(slugOf(slug), id, q);
  }

  @Post(':slug/quote')
  @HttpCode(HttpStatus.OK)
  quote(@Param('slug') slug: string, @Body() dto: PublicQuoteDto) {
    return this.site.quote(slugOf(slug), dto);
  }

  /** Pedidos: limite apertado por IP contra abuso do formulário. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':slug/leads')
  @HttpCode(HttpStatus.ACCEPTED)
  lead(@Param('slug') slug: string, @Body() dto: PublicLeadDto) {
    return this.site.createLead(slugOf(slug), dto);
  }

  @Get(':slug/files/:id')
  async file(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { organization } = await this.site.site(slugOf(slug));
    const { file, buffer } = await this.files.readPublic(organization.id, id);
    const stream = send(res, file, buffer, 'inline');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return stream;
  }

  /**
   * Página para robôs de redes sociais: o SPA não entrega metatags, então
   * o link compartilhado aponta aqui, que devolve Open Graph e redireciona
   * a pessoa para o site.
   */
  @Get(':slug/share')
  @Header('Content-Type', 'text/html; charset=utf-8')
  share(@Param('slug') slug: string, @Req() req: Request) {
    return this.shareHtml(slugOf(slug), undefined, req);
  }

  @Get(':slug/share/models/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  shareModel(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.shareHtml(slugOf(slug), id, req);
  }

  private async shareHtml(slug: string, modelId: string | undefined, req: Request): Promise<string> {
    const data = await this.site.shareData(slug, modelId);
    const home = await this.site.home(slug);
    const apiBase = `${req.protocol}://${req.get('host')}/v1`;
    const siteBase = home.primaryDomain ? `https://${home.primaryDomain}` : `${loadConfig().appUrl}/site/${slug}`;
    const target = `${siteBase}${data.path}`;
    const image = data.imageFileId ? `${apiBase}/public/sites/${slug}/files/${data.imageFileId}` : '';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(data.title)}</title>
<meta name="description" content="${esc(data.description)}">
<meta property="og:type" content="website"><meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(data.title)}"><meta property="og:description" content="${esc(data.description)}">
<meta property="og:url" content="${esc(target)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<link rel="canonical" href="${esc(target)}"><meta http-equiv="refresh" content="0; url=${esc(target)}"></head>
<body><a href="${esc(target)}">${esc(data.title)}</a></body></html>`;
  }
}

/** Personalização do site e pedidos recebidos (equipe). */
@Controller()
export class SiteAdminController {
  constructor(private readonly admin: SiteAdminService) {}

  @RequirePermission('site.manage')
  @Get('site')
  get(@OrgCtx() ctx: OrgContext) {
    return this.admin.get(ctx);
  }

  @RequirePermission('site.manage')
  @Put('site')
  update(@OrgCtx() ctx: OrgContext, @Body() dto: SiteConfigDto) {
    return this.admin.update(ctx, dto);
  }

  @RequirePermission('site.manage')
  @Post('site/publish')
  @HttpCode(HttpStatus.OK)
  publish(@OrgCtx() ctx: OrgContext, @Body() dto: PublishDto) {
    return this.admin.publish(ctx, dto.published);
  }

  @RequirePermission('leads.manage')
  @Get('leads')
  leads(@OrgCtx() ctx: OrgContext, @Query() q: LeadQuery) {
    return this.admin.leads(ctx, q);
  }

  @RequirePermission('leads.manage')
  @Patch('leads/:id')
  lead(@OrgCtx() ctx: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeadStatusDto) {
    return this.admin.updateLead(ctx, id, dto.status, dto.reason);
  }
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
