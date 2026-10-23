import {
  BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Req, Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AvailabilityService } from '../../common/availability.service';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { ProfitabilityService } from '../profitability/profitability.service';
import { REPORTS, type ReportDef, type Row, type ReportColumn } from './catalog';
import { date, dateTime, moneyPlain } from './format';

const DAY = 86_400_000;

type Query = Record<string, string | undefined>;

/**
 * Relatórios. O acesso é o das telas: reports.view (ou reports.financial
 * nos financeiros) mais as permissões do módulo de origem, sempre dentro
 * das filiais autorizadas. Exportar exige reports.export e fica auditado.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly availability: AvailabilityService,
    private readonly profitability: ProfitabilityService,
  ) {}

  allowed(ctx: OrgContext, def: ReportDef): boolean {
    const base = def.financial ? 'reports.financial' : 'reports.view';
    return ctx.permissions.has(base) && def.permissions.every((p) => ctx.permissions.has(p));
  }

  catalog(ctx: OrgContext) {
    return REPORTS.filter((r) => this.allowed(ctx, r)).map(({ run: _run, ...meta }) => meta);
  }

  private find(ctx: OrgContext, key: string): ReportDef {
    const def = REPORTS.find((r) => r.key === key);
    if (!def) throw new NotFoundException('Relatório não encontrado.');
    if (!this.allowed(ctx, def)) throw new ForbiddenException('Seu perfil não tem acesso a este relatório.');
    return def;
  }

  async rows(ctx: OrgContext, key: string, query: Query): Promise<{ def: ReportDef; rows: Row[]; from: Date; to: Date }> {
    const def = this.find(ctx, key);
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new BadRequestException('Período inválido.');
    if (to.getTime() - from.getTime() > 5 * 366 * DAY) throw new BadRequestException('Período máximo de 5 anos.');
    if (query.branchId && !ctx.allBranches && !ctx.branchIds.includes(query.branchId)) throw new ForbiddenException('Sem acesso a esta filial.');
    const filters: Record<string, string> = {};
    for (const f of def.filters) {
      const v = query[f.key]?.trim();
      if (f.required && !v) throw new BadRequestException(`Informe o filtro "${f.label}".`);
      if (v && f.options && !f.options.some((o) => o.value === v)) throw new BadRequestException(`Valor inválido para "${f.label}".`);
      if (v) filters[f.key] = v.slice(0, 120);
    }
    const branchIds = query.branchId ? [query.branchId] : ctx.allBranches ? null : ctx.branchIds;
    const rows = await this.prisma.tenant(ctx, (tx) => def.run(tx, {
      organizationId: ctx.organizationId, from, to, branchIds, filters,
      deps: { availability: this.availability, profitability: this.profitability },
    }));
    return { def, rows, from, to };
  }

  async page(ctx: OrgContext, key: string, query: Query) {
    const { def, rows, from, to } = await this.rows(ctx, key, query);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));
    const { run: _run, ...meta } = def;
    return {
      report: meta, from: from.toISOString(), to: to.toISOString(),
      items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize,
      totals: totalsOf(def.columns, rows),
    };
  }

  async exportCsv(ctx: OrgContext, key: string, query: Query): Promise<{ filename: string; body: Buffer }> {
    if (!ctx.permissions.has('reports.export')) throw new ForbiddenException('Seu perfil não tem permissão para exportar relatórios.');
    const { def, rows, from, to } = await this.rows(ctx, key, query);
    const sep = ';';
    const escape = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [def.columns.map((c) => escape(c.label)).join(sep)];
    for (const row of rows) lines.push(def.columns.map((c) => escape(cell(c, row[c.key]))).join(sep));
    await this.prisma.tenant(ctx, (tx) => this.audit.record(tx, ctx, {
      action: 'report.exported', entityType: 'Report', entityId: key,
      after: { format: 'csv', rows: rows.length, from: from.toISOString(), to: to.toISOString(), filters: query },
    }));
    // BOM: o Excel em pt-BR só reconhece UTF-8 com ele.
    return { filename: `${key}-${new Date().toISOString().slice(0, 10)}.csv`, body: Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8') };
  }

  async printHtml(ctx: OrgContext, key: string, query: Query): Promise<string> {
    const { def, rows, from, to } = await this.rows(ctx, key, query);
    const totals = totalsOf(def.columns, rows);
    const h = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const align = (c: ReportColumn) => (['money', 'number', 'percent'].includes(c.type) ? ' class="n"' : '');
    await this.prisma.tenant(ctx, (tx) => this.audit.record(tx, ctx, { action: 'report.printed', entityType: 'Report', entityId: key, after: { rows: rows.length } }));
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${h(def.title)} — Norty Car</title>
<style>
body{font-family:Inter,Arial,sans-serif;color:#101828;margin:24px;font-size:12px}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#667085}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e7ecf3;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f4f7fb;font-size:11px;text-transform:uppercase;color:#475467}.n{text-align:right;font-variant-numeric:tabular-nums}
tfoot td{font-weight:600}@media print{body{margin:0}}
</style></head><body>
<h1>${h(def.title)}</h1>
<p>${h(ctx.organizationName ?? '')} · ${def.period ? `Período ${date(from)} a ${date(to)} · ` : ''}Emitido em ${dateTime(new Date())} por ${h(ctx.userName)} · ${rows.length} registro(s)</p>
<table><thead><tr>${def.columns.map((c) => `<th${align(c)}>${h(c.label)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${def.columns.map((c) => `<td${align(c)}>${h(cell(c, r[c.key]))}</td>`).join('')}</tr>`).join('')}</tbody>
${Object.keys(totals).length ? `<tfoot><tr>${def.columns.map((c, i) => `<td${align(c)}>${i === 0 ? 'Total' : totals[c.key] !== undefined ? h(moneyPlain(totals[c.key])) : ''}</td>`).join('')}</tr></tfoot>` : ''}
</table><script>window.onload=()=>window.print()</script></body></html>`;
  }
}

function cell(column: ReportColumn, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  switch (column.type) {
    case 'money':
      return moneyPlain(Number(value));
    case 'percent':
      return `${moneyPlain(Number(value))}%`;
    case 'number':
      return Number(value).toLocaleString('pt-BR');
    case 'date':
      return date(String(value).length === 10 ? `${value}T00:00:00.000Z` : String(value));
    case 'datetime':
      return dateTime(String(value));
    default:
      return String(value);
  }
}

/** Soma das colunas de valor (as de percentual não se somam). */
function totalsOf(columns: ReportColumn[], rows: Row[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const c of columns.filter((x) => x.type === 'money')) {
    totals[c.key] = Math.round(rows.reduce((a, r) => a + Math.round(Number(r[c.key] ?? 0) * 100), 0)) / 100;
  }
  return totals;
}

/**
 * Filtros variam por relatório e são validados contra o catálogo no
 * service; por isso a query bruta, só com valores de texto.
 */
function queryOf(req: Request): Query {
  const out: Query = {};
  for (const [k, v] of Object.entries(req.query)) if (typeof v === 'string') out[k] = v;
  return out;
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermission('reports.view')
  @Get()
  catalog(@OrgCtx() ctx: OrgContext) {
    return this.reports.catalog(ctx);
  }

  @Get(':key')
  run(@OrgCtx() ctx: OrgContext, @Param('key') key: string, @Req() req: Request) {
    return this.reports.page(ctx, key, queryOf(req));
  }

  @RequirePermission('reports.export')
  @Get(':key/export')
  async export(@OrgCtx() ctx: OrgContext, @Param('key') key: string, @Req() req: Request, @Res() res: Response) {
    const query = queryOf(req);
    if (query.format && query.format !== 'csv') throw new BadRequestException('Formato disponível: csv. Para PDF, use a versão para impressão.');
    const { filename, body } = await this.reports.exportCsv(ctx, key, query);
    // Resposta enviada direto: o SerializeInterceptor global transformaria
    // um StreamableFile em JSON.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(body);
  }

  @Get(':key/print')
  async print(@OrgCtx() ctx: OrgContext, @Param('key') key: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return this.reports.printHtml(ctx, key, queryOf(req));
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService], exports: [ReportsService] })
export class ReportsModule {}
