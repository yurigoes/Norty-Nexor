import {
  Body, Controller, Get, HttpCode, HttpException, HttpStatus, Injectable, Logger, Module, Post,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { checkRefuel, formatPlate, maintenanceDue, toCents, fromCents, type Permission } from '@nortycar/shared';
import { PrismaService, type Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { num } from '../../common/serialize.interceptor';
import { OrgCtx, RequirePermission, type OrgContext } from '../../common/context';
import { loadConfig } from '../../config/env';
import { DashboardModule, DashboardService } from '../dashboard/dashboard.module';
import { ProfitabilityService } from '../profitability/profitability.service';
import { todayStart } from '../notifications/alert-jobs';

const DAY = 86_400_000;
const MAX_TURNS = 6;

class HistoryItemDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(8000) content!: string;
}

class AskDto {
  @IsString() @Length(2, 2000) question!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => HistoryItemDto) history?: HistoryItemDto[];
}

interface ToolDef {
  name: string;
  description: string;
  permissions: Permission[];
  input_schema: Anthropic.Tool['input_schema'];
  run: (tx: Tx, ctx: OrgContext, input: Record<string, unknown>) => Promise<unknown>;
}

const noInput = { type: 'object' as const, properties: {}, additionalProperties: false };

/**
 * Norty IA. O modelo não acessa o banco: ele só pode pedir ferramentas
 * desta lista, pré-autorizadas, somente leitura, e cada uma roda dentro
 * da transação escopada na empresa do usuário (RLS) e só se o perfil dele
 * tiver a permissão da ferramenta. Nenhuma ação (aprovar, excluir, mudar
 * contrato) é exposta ao modelo.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly config = loadConfig().ai;
  private client: Anthropic | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dashboard: DashboardService,
    private readonly profitability: ProfitabilityService,
  ) {}

  get configured(): boolean {
    return Boolean(this.config.anthropicApiKey);
  }

  status(ctx: OrgContext) {
    return {
      configured: this.configured,
      model: this.configured ? this.config.model : null,
      tools: this.tools(ctx).map((t) => ({ name: t.name, description: t.description })),
      message: this.configured ? 'Norty IA disponível.' : 'Integração não configurada: defina ANTHROPIC_API_KEY no servidor para habilitar a Norty IA.',
    };
  }

  private tools(ctx: OrgContext): ToolDef[] {
    return TOOLS.filter((t) => t.permissions.every((p) => ctx.permissions.has(p)));
  }

  async ask(ctx: OrgContext, dto: AskDto): Promise<{ answer: string; toolsUsed: string[]; model: string }> {
    if (!this.configured) {
      throw new HttpException({ message: 'Integração não configurada: a Norty IA precisa de ANTHROPIC_API_KEY no servidor.', code: 'not_configured' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    this.client ??= new Anthropic({ apiKey: this.config.anthropicApiKey });
    const tools = this.tools(ctx);
    const deps = { dashboard: this.dashboard, profitability: this.profitability };
    const messages: Anthropic.MessageParam[] = [
      ...(dto.history ?? []).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: dto.question },
    ];
    const used: string[] = [];
    const system = `Você é a Norty IA, assistente do Norty Car (gestão de locadora de veículos) da empresa "${ctx.organizationName}". `
      + 'Responda em português do Brasil, de forma objetiva, com valores em reais e datas no padrão brasileiro. '
      + 'Use apenas os dados devolvidos pelas ferramentas; se a informação não estiver disponível, diga isso claramente em vez de supor. '
      + 'Você só consulta: não aprova, não altera e não exclui nada — oriente o usuário a fazer ações na tela correspondente. '
      + `Hoje é ${new Date().toISOString().slice(0, 10)}.`;

    let answer = '';
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 4000,
        system,
        tools: tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
        messages,
      });
      if (response.stop_reason === 'refusal') {
        answer = 'Não posso responder a esta pergunta.';
        break;
      }
      const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (response.stop_reason !== 'tool_use' || !calls.length) {
        answer = text || 'Sem resposta.';
        break;
      }
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        const tool = tools.find((t) => t.name === call.name);
        used.push(call.name);
        if (!tool) {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Ferramenta não autorizada para este perfil.', is_error: true });
          continue;
        }
        try {
          const data = await this.prisma.tenant(ctx, (tx) => tool.run(tx, ctx, { ...(call.input as Record<string, unknown>), __deps: deps }));
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(data).slice(0, 60_000) });
        } catch (error) {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: `Falha ao consultar: ${error instanceof Error ? error.message : String(error)}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
      answer = text;
    }

    await this.prisma.tenant(ctx, (tx) => this.audit.record(tx, ctx, {
      action: 'ai.question', entityType: 'NortyIA',
      // Só um trecho da pergunta: a trilha registra o uso, não o conteúdo completo.
      after: { question: dto.question.slice(0, 200), toolsUsed: [...new Set(used)], model: this.config.model },
    }));
    return { answer, toolsUsed: [...new Set(used)], model: this.config.model };
  }
}

type Deps = { dashboard: DashboardService; profitability: ProfitabilityService };
const depsOf = (input: Record<string, unknown>) => input.__deps as Deps;
const branchOf = (ctx: OrgContext) => (ctx.allBranches ? {} : { branchId: { in: ctx.branchIds } });

const TOOLS: ToolDef[] = [
  {
    name: 'resumo_operacional',
    description: 'Resumo do painel da empresa no mês corrente: frota por situação, ocupação, contratos, reservas, receita, inadimplência, cauções, multas, manutenção e estoque crítico (cada bloco só aparece se o usuário puder ver).',
    permissions: ['dashboard.view'],
    input_schema: noInput,
    run: (_tx, ctx, input) => depsOf(input).dashboard.build(ctx, {}),
  },
  {
    name: 'contas_vencidas',
    description: 'Lista contas a receber vencidas em aberto, com cliente, vencimento e saldo.',
    permissions: ['finance.view'],
    input_schema: noInput,
    async run(tx, ctx) {
      const rows = await tx.receivable.findMany({
        where: { ...branchOf(ctx), status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: todayStart(new Date()) } },
        include: { customer: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: 100,
      });
      return rows.map((r) => ({ cliente: r.customer?.name ?? null, titulo: r.description, vencimento: r.dueDate.toISOString().slice(0, 10), saldo: fromCents(toCents(num(r.amount)) - toCents(num(r.paidAmount))) }));
    },
  },
  {
    name: 'vencimentos_proximos',
    description: 'Vencimentos nos próximos dias: CNH de motoristas, licenciamento e IPVA de veículos, apólices e contratos terminando.',
    permissions: ['fleet.view'],
    input_schema: { type: 'object', properties: { dias: { type: 'integer', minimum: 1, maximum: 180, description: 'Horizonte em dias (padrão 30).' } }, additionalProperties: false },
    async run(tx, ctx, input) {
      const days = Math.min(180, Math.max(1, Number(input.dias) || 30));
      const limit = new Date(Date.now() + days * DAY);
      const [vehicles, policies, contracts] = await Promise.all([
        tx.vehicleUnit.findMany({ where: { ...branchOf(ctx), deletedAt: null, commercialStatus: { not: 'SOLD' }, OR: [{ licensingDueDate: { lte: limit } }, { ipvaDueDate: { lte: limit } }] }, select: { plate: true, licensingDueDate: true, ipvaDueDate: true } }),
        ctx.permissions.has('claims.view') ? tx.insurancePolicy.findMany({ where: { active: true, endsAt: { lte: limit } }, select: { policyNumber: true, endsAt: true } }) : [],
        ctx.permissions.has('contracts.view') ? tx.rentalContract.findMany({ where: { ...branchOf(ctx), status: 'ACTIVE', endAt: { lte: limit } }, select: { number: true, endAt: true } }) : [],
      ]);
      // CNH só para quem pode ver cadastro de pessoas — e sem CPF.
      const cnh = ctx.permissions.has('customers.view')
        ? await tx.driver.findMany({ where: { active: true, anonymizedAt: null, cnhExpiresAt: { lte: limit } }, select: { name: true, cnhExpiresAt: true } })
        : [];
      return {
        veiculos: vehicles.map((v) => ({ placa: formatPlate(v.plate), licenciamento: v.licensingDueDate?.toISOString().slice(0, 10) ?? null, ipva: v.ipvaDueDate?.toISOString().slice(0, 10) ?? null })),
        cnh: cnh.map((d) => ({ motorista: d.name, validade: d.cnhExpiresAt.toISOString().slice(0, 10) })),
        apolices: policies.map((p) => ({ apolice: p.policyNumber, fim: p.endsAt.toISOString().slice(0, 10) })),
        contratos: contracts.map((c) => ({ contrato: c.number, fim: c.endAt.toISOString() })),
      };
    },
  },
  {
    name: 'custos_por_veiculo',
    description: 'Rentabilidade por veículo nos últimos 12 meses: receita, custos, resultado, margem, ocupação e dados faltantes.',
    permissions: ['reports.financial', 'fleet.view'],
    input_schema: noInput,
    async run(tx, ctx, input) {
      const to = new Date();
      const rows = await depsOf(input).profitability.compute(tx, ctx.organizationId, { from: new Date(to.getTime() - 365 * DAY), to, branchIds: ctx.allBranches ? null : ctx.branchIds });
      return rows.map((r) => ({ placa: formatPlate(r.plate), modelo: r.model, receita: r.revenue, custos: r.costs, resultado: r.operatingResult, margem: r.margin, ocupacao: r.occupancy, faltando: r.missing }));
    },
  },
  {
    name: 'manutencoes_devidas',
    description: 'Planos de manutenção preventiva vencendo ou vencidos, com km e dias restantes.',
    permissions: ['maintenance.view'],
    input_schema: noInput,
    async run(tx, ctx) {
      const plans = await tx.maintenancePlan.findMany({
        where: { active: true, vehicle: { ...branchOf(ctx), deletedAt: null, commercialStatus: { not: 'SOLD' } } },
        include: { vehicle: { select: { plate: true, odometerKm: true } } },
      });
      return plans.map((p) => ({ p, d: maintenanceDue({ intervalKm: p.intervalKm, intervalDays: p.intervalDays, lastDoneKm: p.lastDoneKm, lastDoneAt: p.lastDoneAt, currentKm: p.vehicle.odometerKm, alertKmBefore: p.alertKmBefore, alertDaysBefore: p.alertDaysBefore }) }))
        .filter((x) => x.d.state === 'DUE_SOON' || x.d.state === 'OVERDUE')
        .map((x) => ({ placa: formatPlate(x.p.vehicle.plate), plano: x.p.name, situacao: x.d.state === 'OVERDUE' ? 'vencida' : 'próxima', kmRestantes: x.d.kmRemaining, diasRestantes: x.d.daysRemaining }));
    },
  },
  {
    name: 'sugestao_reposicao',
    description: 'Produtos abaixo do estoque mínimo, com consumo dos últimos 90 dias e quantidade sugerida para repor.',
    permissions: ['inventory.view'],
    input_schema: noInput,
    async run(tx) {
      const since = new Date(Date.now() - 90 * DAY);
      const products = await tx.inventoryProduct.findMany({ where: { active: true, minStock: { gt: 0 } }, include: { balances: true } });
      const out = [];
      for (const p of products) {
        const balance = p.balances.reduce((a, b) => a + num(b.quantity), 0);
        if (balance >= num(p.minStock)) continue;
        const consumed = await tx.inventoryMovement.aggregate({ where: { productId: p.id, at: { gte: since }, quantity: { lt: 0 }, type: { not: 'TRANSFER_OUT' } }, _sum: { quantity: true } });
        const used = Math.abs(num(consumed._sum.quantity));
        const target = p.maxStock ? num(p.maxStock) : Math.max(num(p.minStock) * 2, used);
        out.push({ produto: p.description, codigo: p.sku, saldo: balance, minimo: num(p.minStock), consumo90dias: used, repor: Math.max(0, Math.ceil(target - balance)) });
      }
      return out;
    },
  },
  {
    name: 'anomalias_abastecimento',
    description: 'Abastecimentos dos últimos 90 dias sinalizados como inconsistentes (km regressivo, litros acima do tanque, total divergente, consumo fora da faixa).',
    permissions: ['refuel.view'],
    input_schema: noInput,
    async run(tx, ctx) {
      const since = new Date(Date.now() - 90 * DAY);
      const rows = await tx.refuelRecord.findMany({ where: { at: { gte: since }, ...(ctx.allBranches ? {} : { vehicle: { branchId: { in: ctx.branchIds } } }) }, include: { vehicle: { select: { plate: true, tankCapacityLiters: true } } }, orderBy: { at: 'asc' } });
      const flagged = rows.filter((r) => r.flags.length);
      // Registros antigos sem flag gravada são reavaliados com a mesma regra.
      const recheck = rows.filter((r) => !r.flags.length).map((r) => ({ r, check: checkRefuel({ liters: num(r.liters), pricePerLiter: num(r.pricePerLiter), total: num(r.total), odometerKm: r.odometerKm, tankCapacityLiters: r.vehicle.tankCapacityLiters }) })).filter((x) => x.check.flags.length);
      return [
        ...flagged.map((r) => ({ placa: formatPlate(r.vehicle.plate), data: r.at.toISOString(), litros: num(r.liters), total: num(r.total), sinais: r.flags })),
        ...recheck.map(({ r, check }) => ({ placa: formatPlate(r.vehicle.plate), data: r.at.toISOString(), litros: num(r.liters), total: num(r.total), sinais: check.flags })),
      ];
    },
  },
];

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @RequirePermission('ai.use')
  @Get('status')
  status(@OrgCtx() ctx: OrgContext) {
    return this.ai.status(ctx);
  }

  @RequirePermission('ai.use')
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  ask(@OrgCtx() ctx: OrgContext, @Body() dto: AskDto) {
    return this.ai.ask(ctx, dto);
  }
}

@Module({ imports: [DashboardModule], controllers: [AiController], providers: [AiService] })
export class AiModule {}
