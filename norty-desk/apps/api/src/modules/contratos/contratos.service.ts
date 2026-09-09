import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ContratoView,
  CustoDoChamado,
  CustoView,
  FornecedorView,
  LinhaDeCusto,
  OrcamentoView,
  RelatorioDeCusto,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import type {
  BuscarContratosDto,
  EditarContratoDto,
  EscreverContratoDto,
  EscreverFornecedorDto,
  EscreverOrcamentoDto,
  LancarCustoDto,
  RelatorioDeCustoDto,
} from './dto';

const CONTRATO = {
  supplier: { select: { id: true, name: true } },
  _count: { select: { assets: true } },
} satisfies Prisma.ContractInclude;

type ContratoComRelacoes = Prisma.ContractGetPayload<{ include: typeof CONTRATO }>;

const CUSTO = {
  budget: { select: { id: true, name: true } },
  author: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TicketCostInclude;

type CustoComRelacoes = Prisma.TicketCostGetPayload<{ include: typeof CUSTO }>;

/**
 * Decimal vira `number` **uma vez só**, aqui (CLAUDE.md, regra 5).
 *
 * O Prisma devolve `Decimal`, que serializa como string no JSON. Deixar
 * o cliente converter espalharia `Number(x)` por dez telas — e a décima
 * primeira esqueceria.
 */
function emNumero(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : Number(valor);
}

/**
 * Contratos, fornecedores, orçamento e custo do chamado.
 *
 * Cobre `glpi_contracts`, `glpi_suppliers`, `glpi_contracts_items`,
 * `glpi_budgets`, `glpi_contractcosts` e `glpi_ticketcosts`. Duas
 * decisões afastam o desenho do original:
 *
 * 1. **O aviso de vencimento é consultável.** No GLPI a antecedência é
 *    coluna e nada a lê: o contrato vence e alguém descobre pela
 *    fatura. Aqui `?vencendoEm=` é a pergunta que a tela faz, e a
 *    renovação automática não dispensa o aviso — torna-o mais urgente,
 *    porque é a última chance de não renovar.
 *
 * 2. **O custo do chamado é a soma das linhas.** `glpi_ticketcosts` tem
 *    três pares de colunas (`cost_time`, `cost_fixed`, `cost_material`)
 *    e duas sempre vêm zeradas. Aqui é um discriminador, e não há total
 *    gravado no chamado: um total gravado diverge da primeira linha
 *    corrigida.
 */
@Injectable()
export class ContratosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // -------------------------------------------------------------------
  // Fornecedores
  // -------------------------------------------------------------------

  async listarFornecedores(usuario: UsuarioAutenticado): Promise<FornecedorView[]> {
    const fornecedores = await this.prisma.supplier.findMany({
      where: { organizationId: usuario.organizationId },
      include: { _count: { select: { contracts: true } } },
      orderBy: { name: 'asc' },
    });

    return fornecedores.map((f) => ({
      id: f.id,
      name: f.name,
      email: f.email,
      phone: f.phone,
      contractCount: f._count.contracts,
    }));
  }

  async criarFornecedor(
    usuario: UsuarioAutenticado,
    dto: EscreverFornecedorDto,
  ): Promise<FornecedorView> {
    try {
      const criado = await this.prisma.supplier.create({
        data: {
          organizationId: usuario.organizationId,
          name: dto.name,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
        },
      });

      await this.auditoria.registrar(usuario, {
        action: 'fornecedor.criado',
        entity: 'Supplier',
        entityId: criado.id,
        depois: { name: dto.name },
      });

      return { ...criado, contractCount: 0 };
    } catch (erro) {
      throw ContratosService.traduzirDuplicidade(erro, `fornecedor "${dto.name}"`);
    }
  }

  // -------------------------------------------------------------------
  // Contratos
  // -------------------------------------------------------------------

  async listarContratos(
    usuario: UsuarioAutenticado,
    filtro: BuscarContratosDto,
  ): Promise<ContratoView[]> {
    const termo = filtro.q?.trim();

    const contratos = await this.prisma.contract.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(filtro.incluirInativos ? {} : { isActive: true }),
        ...(filtro.kind ? { kind: filtro.kind } : {}),
        ...(filtro.supplierId ? { supplierId: filtro.supplierId } : {}),
        // Contrato por prazo indeterminado não entra no recorte de
        // vencimento: ele não vence, e listá-lo ali seria ruído.
        ...(filtro.vencendoEm === undefined
          ? {}
          : {
              endsAt: {
                not: null,
                lte: new Date(Date.now() + filtro.vencendoEm * 86_400_000),
              },
            }),
        ...(termo
          ? {
              OR: [
                { name: { contains: termo, mode: 'insensitive' } },
                { number: { contains: termo, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: CONTRATO,
      // O que vence antes vem antes: é o que se procura ao abrir a tela.
      // Os sem fim vão para o fundo.
      orderBy: [{ endsAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      take: 200,
    });

    return contratos.map((c) => ContratosService.paraContrato(c));
  }

  async obterContrato(usuario: UsuarioAutenticado, id: string): Promise<ContratoView> {
    return ContratosService.paraContrato(await this.exigirContrato(usuario, id));
  }

  /** Os ativos que o contrato cobre. É o que responde "isso está na garantia?". */
  async ativosDoContrato(usuario: UsuarioAutenticado, id: string) {
    await this.exigirContrato(usuario, id);

    const vinculos = await this.prisma.contractAsset.findMany({
      where: { contractId: id },
      include: { asset: { select: { id: true, name: true, tag: true, status: true } } },
      orderBy: { addedAt: 'desc' },
      take: 500,
    });

    return vinculos.map((v) => v.asset);
  }

  async criarContrato(
    usuario: UsuarioAutenticado,
    dto: EscreverContratoDto,
  ): Promise<ContratoView> {
    await this.exigirFornecedor(usuario, dto.supplierId);
    ContratosService.exigirVigencia(dto.startsAt, dto.endsAt);

    try {
      const contrato = await this.prisma.contract.create({
        data: {
          organizationId: usuario.organizationId,
          number: dto.number,
          name: dto.name,
          kind: dto.kind ?? 'SERVICO',
          supplierId: dto.supplierId ?? null,
          startsAt: new Date(dto.startsAt),
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          noticeDays: dto.noticeDays ?? 30,
          autoRenew: dto.autoRenew ?? false,
          billingPeriod: dto.billingPeriod ?? 'MENSAL',
          value: new Prisma.Decimal(dto.value ?? 0),
          notes: dto.notes ?? null,
          isActive: dto.isActive ?? true,
        },
        include: CONTRATO,
      });

      await this.auditoria.registrar(usuario, {
        action: 'contrato.criado',
        entity: 'Contract',
        entityId: contrato.id,
        depois: { number: dto.number, name: dto.name, value: dto.value ?? 0 },
      });

      return ContratosService.paraContrato(contrato);
    } catch (erro) {
      throw ContratosService.traduzirDuplicidade(erro, `contrato "${dto.number}"`);
    }
  }

  async editarContrato(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarContratoDto,
  ): Promise<ContratoView> {
    const antes = await this.exigirContrato(usuario, id);
    await this.exigirFornecedor(usuario, dto.supplierId);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : antes.startsAt;
    const endsAt =
      dto.endsAt === undefined ? antes.endsAt : dto.endsAt ? new Date(dto.endsAt) : null;
    ContratosService.exigirVigencia(startsAt, endsAt);

    try {
      const contrato = await this.prisma.contract.update({
        where: { id },
        data: {
          ...(dto.number === undefined ? {} : { number: dto.number }),
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.kind === undefined ? {} : { kind: dto.kind }),
          ...(dto.supplierId === undefined ? {} : { supplierId: dto.supplierId }),
          startsAt,
          endsAt,
          ...(dto.noticeDays === undefined ? {} : { noticeDays: dto.noticeDays }),
          ...(dto.autoRenew === undefined ? {} : { autoRenew: dto.autoRenew }),
          ...(dto.billingPeriod === undefined ? {} : { billingPeriod: dto.billingPeriod }),
          ...(dto.value === undefined ? {} : { value: new Prisma.Decimal(dto.value) }),
          ...(dto.notes === undefined ? {} : { notes: dto.notes }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
        include: CONTRATO,
      });

      await this.auditoria.registrar(usuario, {
        action: 'contrato.editado',
        entity: 'Contract',
        entityId: id,
        antes: { value: Number(antes.value), endsAt: antes.endsAt?.toISOString() ?? null },
        depois: { value: Number(contrato.value), endsAt: contrato.endsAt?.toISOString() ?? null },
      });

      return ContratosService.paraContrato(contrato);
    } catch (erro) {
      throw ContratosService.traduzirDuplicidade(erro, `contrato "${dto.number ?? antes.number}"`);
    }
  }

  async vincularAtivo(
    usuario: UsuarioAutenticado,
    id: string,
    assetId: string,
  ): Promise<ContratoView> {
    await this.exigirContrato(usuario, id);

    const ativo = await this.prisma.asset.count({
      where: { id: assetId, organizationId: usuario.organizationId },
    });
    if (!ativo) throw new NotFoundException('Ativo não encontrado.');

    // Vincular duas vezes não é erro: a segunda chamada não deve
    // derrubar a primeira nem estourar na cara de quem clicou.
    await this.prisma.contractAsset.createMany({
      data: [{ contractId: id, assetId }],
      skipDuplicates: true,
    });

    return this.obterContrato(usuario, id);
  }

  async desvincularAtivo(
    usuario: UsuarioAutenticado,
    id: string,
    assetId: string,
  ): Promise<ContratoView> {
    await this.exigirContrato(usuario, id);

    const { count } = await this.prisma.contractAsset.deleteMany({
      where: { contractId: id, assetId },
    });
    if (count === 0) throw new NotFoundException('Este ativo não está no contrato.');

    return this.obterContrato(usuario, id);
  }

  // -------------------------------------------------------------------
  // Orçamento
  // -------------------------------------------------------------------

  async listarOrcamentos(usuario: UsuarioAutenticado): Promise<OrcamentoView[]> {
    const orcamentos = await this.prisma.budget.findMany({
      where: { organizationId: usuario.organizationId },
      orderBy: { startsAt: 'desc' },
    });

    if (orcamentos.length === 0) return [];

    // O gasto é a soma dos lançamentos, numa consulta só: uma por
    // orçamento seria o N+1 numa tela que sempre lista todos.
    const gastos = await this.prisma.ticketCost.groupBy({
      by: ['budgetId'],
      where: { budgetId: { in: orcamentos.map((o) => o.id) } },
      _sum: { amount: true },
    });

    const porOrcamento = new Map(gastos.map((g) => [g.budgetId, Number(g._sum.amount ?? 0)]));

    return orcamentos.map((o) => ({
      id: o.id,
      name: o.name,
      startsAt: o.startsAt.toISOString(),
      endsAt: o.endsAt.toISOString(),
      value: Number(o.value),
      notes: o.notes,
      spent: porOrcamento.get(o.id) ?? 0,
    }));
  }

  async criarOrcamento(
    usuario: UsuarioAutenticado,
    dto: EscreverOrcamentoDto,
  ): Promise<OrcamentoView> {
    ContratosService.exigirVigencia(dto.startsAt, dto.endsAt, true);

    try {
      const orcamento = await this.prisma.budget.create({
        data: {
          organizationId: usuario.organizationId,
          name: dto.name,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
          value: new Prisma.Decimal(dto.value ?? 0),
          notes: dto.notes ?? null,
        },
      });

      await this.auditoria.registrar(usuario, {
        action: 'orcamento.criado',
        entity: 'Budget',
        entityId: orcamento.id,
        depois: { name: dto.name, value: dto.value ?? 0 },
      });

      return {
        id: orcamento.id,
        name: orcamento.name,
        startsAt: orcamento.startsAt.toISOString(),
        endsAt: orcamento.endsAt.toISOString(),
        value: Number(orcamento.value),
        notes: orcamento.notes,
        spent: 0,
      };
    } catch (erro) {
      throw ContratosService.traduzirDuplicidade(erro, `orçamento "${dto.name}"`);
    }
  }

  // -------------------------------------------------------------------
  // Custo do chamado
  // -------------------------------------------------------------------

  async custosDoChamado(usuario: UsuarioAutenticado, ticketId: string): Promise<CustoDoChamado> {
    await this.exigirChamado(usuario, ticketId);

    const linhas = await this.prisma.ticketCost.findMany({
      where: { ticketId },
      include: CUSTO,
      orderBy: { createdAt: 'asc' },
    });

    return {
      linhas: linhas.map((l) => ContratosService.paraCusto(l)),
      total: linhas.reduce((soma, l) => soma + Number(l.amount), 0),
    };
  }

  async lancarCusto(
    usuario: UsuarioAutenticado,
    ticketId: string,
    dto: LancarCustoDto,
  ): Promise<CustoDoChamado> {
    await this.exigirChamado(usuario, ticketId);
    await this.exigirOrcamento(usuario, dto.budgetId);

    const { hours, hourlyRate, amount } = ContratosService.valorDaLinha(dto);

    await this.prisma.ticketCost.create({
      data: {
        ticketId,
        kind: dto.kind,
        label: dto.label,
        hours: hours === null ? null : new Prisma.Decimal(hours),
        hourlyRate: hourlyRate === null ? null : new Prisma.Decimal(hourlyRate),
        amount: new Prisma.Decimal(amount),
        budgetId: dto.budgetId ?? null,
        authorId: usuario.userId,
      },
    });

    return this.custosDoChamado(usuario, ticketId);
  }

  async removerCusto(
    usuario: UsuarioAutenticado,
    ticketId: string,
    custoId: string,
  ): Promise<CustoDoChamado> {
    await this.exigirChamado(usuario, ticketId);

    const { count } = await this.prisma.ticketCost.deleteMany({
      where: { id: custoId, ticketId },
    });
    if (count === 0) throw new NotFoundException('Lançamento não encontrado.');

    return this.custosDoChamado(usuario, ticketId);
  }

  /**
   * Quanto custou atender, por categoria e por tipo.
   *
   * É o número que faz o resto disto valer a pena — e o que o GLPI só
   * entrega quem exportar `glpi_ticketcosts` para uma planilha.
   */
  async relatorio(
    usuario: UsuarioAutenticado,
    filtro: RelatorioDeCustoDto,
  ): Promise<RelatorioDeCusto> {
    const ate = filtro.ate ? new Date(filtro.ate) : new Date();
    const de = filtro.de ? new Date(filtro.de) : new Date(ate.getTime() - 90 * 86_400_000);

    const porCategoria = await this.prisma.$queryRaw<
      { chave: string | null; rotulo: string | null; chamados: bigint; total: string }[]
    >`
      SELECT c."id" AS chave,
             c."name" AS rotulo,
             COUNT(DISTINCT t."id") AS chamados,
             COALESCE(SUM(tc."amount"), 0)::text AS total
      FROM "ticket_costs" tc
      JOIN "tickets" t ON t."id" = tc."ticketId"
      LEFT JOIN "categories" c ON c."id" = t."categoryId"
      WHERE t."organizationId" = ${usuario.organizationId}::uuid
        AND tc."createdAt" >= ${de} AND tc."createdAt" <= ${ate}
      GROUP BY c."id", c."name"
      ORDER BY SUM(tc."amount") DESC
    `;

    const porTipo = await this.prisma.$queryRaw<
      { chave: string; rotulo: string; chamados: bigint; total: string }[]
    >`
      SELECT tc."kind"::text AS chave,
             tc."kind"::text AS rotulo,
             COUNT(DISTINCT t."id") AS chamados,
             COALESCE(SUM(tc."amount"), 0)::text AS total
      FROM "ticket_costs" tc
      JOIN "tickets" t ON t."id" = tc."ticketId"
      WHERE t."organizationId" = ${usuario.organizationId}::uuid
        AND tc."createdAt" >= ${de} AND tc."createdAt" <= ${ate}
      GROUP BY tc."kind"
      ORDER BY SUM(tc."amount") DESC
    `;

    const linhas = (
      brutas: { chave: string | null; rotulo: string | null; chamados: bigint; total: string }[],
    ): LinhaDeCusto[] =>
      brutas.map((l) => ({
        chave: l.chave ?? 'sem-categoria',
        rotulo: l.rotulo ?? 'Sem categoria',
        chamados: Number(l.chamados),
        total: Number(l.total),
      }));

    const categorias = linhas(porCategoria);

    return {
      de: de.toISOString(),
      ate: ate.toISOString(),
      total: categorias.reduce((soma, l) => soma + l.total, 0),
      porCategoria: categorias,
      porTipo: linhas(porTipo),
    };
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  /**
   * O valor da linha.
   *
   * Em `TEMPO` o produto `hours * hourlyRate` é gravado, não recalculado
   * na leitura: é o que preserva o histórico quando o valor-hora muda no
   * ano seguinte. O CHECK do banco garante que só `TEMPO` tem os dois.
   */
  private static valorDaLinha(dto: LancarCustoDto): {
    hours: number | null;
    hourlyRate: number | null;
    amount: number;
  } {
    if (dto.kind === 'TEMPO') {
      if (dto.hours === undefined || dto.hourlyRate === undefined) {
        throw new BadRequestException(
          'Custo de tempo precisa das horas e do valor da hora: sem os dois, "2 horas" entraria como zero.',
        );
      }
      return {
        hours: dto.hours,
        hourlyRate: dto.hourlyRate,
        amount: Math.round(dto.hours * dto.hourlyRate * 100) / 100,
      };
    }

    if (dto.amount === undefined) {
      throw new BadRequestException('Informe o valor do lançamento.');
    }

    if (dto.hours !== undefined || dto.hourlyRate !== undefined) {
      throw new BadRequestException('Horas e valor-hora só existem em custo de tempo.');
    }

    return { hours: null, hourlyRate: null, amount: dto.amount };
  }

  private async exigirContrato(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<ContratoComRelacoes> {
    const contrato = await this.prisma.contract.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: CONTRATO,
    });

    if (!contrato) throw new NotFoundException('Contrato não encontrado.');
    return contrato;
  }

  private async exigirChamado(usuario: UsuarioAutenticado, ticketId: string): Promise<void> {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
  }

  private async exigirFornecedor(
    usuario: UsuarioAutenticado,
    supplierId: string | null | undefined,
  ): Promise<void> {
    if (!supplierId) return;
    const existe = await this.prisma.supplier.count({
      where: { id: supplierId, organizationId: usuario.organizationId },
    });
    if (!existe) throw new BadRequestException('Fornecedor não encontrado nesta organização.');
  }

  private async exigirOrcamento(
    usuario: UsuarioAutenticado,
    budgetId: string | null | undefined,
  ): Promise<void> {
    if (!budgetId) return;
    const existe = await this.prisma.budget.count({
      where: { id: budgetId, organizationId: usuario.organizationId },
    });
    if (!existe) throw new BadRequestException('Orçamento não encontrado nesta organização.');
  }

  private static exigirVigencia(
    inicio: Date | string,
    fim: Date | string | null | undefined,
    fimObrigatorio = false,
  ): void {
    if (!fim) {
      if (fimObrigatorio) throw new BadRequestException('Informe o fim da vigência.');
      return;
    }
    if (new Date(fim) <= new Date(inicio)) {
      throw new BadRequestException('A vigência termina antes de começar.');
    }
  }

  private static traduzirDuplicidade(erro: unknown, oQue: string): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException(`Já existe um ${oQue}.`);
    }
    return erro;
  }

  private static paraContrato(c: ContratoComRelacoes): ContratoView {
    return {
      id: c.id,
      number: c.number,
      name: c.name,
      kind: c.kind,
      supplier: c.supplier,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt?.toISOString() ?? null,
      noticeDays: c.noticeDays,
      autoRenew: c.autoRenew,
      billingPeriod: c.billingPeriod,
      value: Number(c.value),
      notes: c.notes,
      isActive: c.isActive,
      assetCount: c._count.assets,
    };
  }

  private static paraCusto(l: CustoComRelacoes): CustoView {
    return {
      id: l.id,
      kind: l.kind,
      label: l.label,
      hours: emNumero(l.hours),
      hourlyRate: emNumero(l.hourlyRate),
      amount: Number(l.amount),
      budget: l.budget,
      author: l.author
        ? { kind: 'USER', id: l.author.id, name: l.author.name, email: l.author.email }
        : null,
      createdAt: l.createdAt.toISOString(),
    };
  }
}
