import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  can,
  type ConsumivelDetail,
  type ConsumivelView,
  type MovimentoView,
  type SuprimentosDoAtivo,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { BuscarConsumiveisDto, EditarConsumivelDto, EscreverConsumivelDto, MovimentarDto } from './dto';

const INCLUDE_ITEM = {
  manufacturer: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  compatibleModels: { include: { assetModel: { select: { id: true, name: true } } } },
} satisfies Prisma.ConsumableItemInclude;
type ItemComRelacoes = Prisma.ConsumableItemGetPayload<{ include: typeof INCLUDE_ITEM }>;

const INCLUDE_MOVIMENTO = {
  asset: { select: { id: true, name: true, tag: true } },
  user: { select: { id: true, name: true } },
  author: { select: { id: true, name: true } },
} satisfies Prisma.ConsumableMovementInclude;
type MovimentoComRelacoes = Prisma.ConsumableMovementGetPayload<{ include: typeof INCLUDE_MOVIMENTO }>;

type Saldo = { saldo: number; ultimo: Date | null };

/** Efeito de um movimento no saldo. Ajuste já vem com sinal. */
const efeito = (kind: string, quantidade: number) => (kind === 'SAIDA' ? -quantidade : quantidade);

/**
 * Consumíveis e cartuchos.
 *
 * O GLPI guarda uma linha por unidade (cada cartucho, com data de entrada
 * e de uso). Aqui o estoque é a soma de **movimentações** — entrada,
 * saída, ajuste —, que responde as mesmas perguntas ("quanto tem?",
 * "para quem foi?", "quantos toners essa impressora comeu?") sem mil
 * linhas para cem caixas de papel.
 */
@Injectable()
export class ConsumiveisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(usuario: UsuarioAutenticado, filtro: BuscarConsumiveisDto): Promise<ConsumivelView[]> {
    const termo = filtro.q?.trim();
    const itens = await this.prisma.consumableItem.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(filtro.incluirInativos ? {} : { isActive: true }),
        ...(filtro.kind ? { kind: filtro.kind } : {}),
        ...(termo
          ? {
              OR: [
                { name: { contains: termo, mode: 'insensitive' } },
                { reference: { contains: termo, mode: 'insensitive' } },
                { manufacturer: { name: { contains: termo, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: INCLUDE_ITEM,
      orderBy: { name: 'asc' },
      take: 500,
    });
    const saldos = await this.saldos(itens.map((i) => i.id));
    const views = itens.map((i) => ConsumiveisService.paraView(i, saldos.get(i.id)));
    return filtro.abaixoDoMinimo ? views.filter((v) => v.belowMin) : views;
  }

  async detalhe(usuario: UsuarioAutenticado, id: string): Promise<ConsumivelDetail> {
    const item = await this.prisma.consumableItem.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE_ITEM,
    });
    if (!item) throw new NotFoundException('Consumível não encontrado.');

    const [saldo, movimentos] = await Promise.all([
      this.saldos([id]).then((m) => m.get(id)),
      this.prisma.consumableMovement.findMany({
        where: { itemId: id },
        include: INCLUDE_MOVIMENTO,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
    ]);

    const view = ConsumiveisService.paraView(item, saldo);
    // Saldo corrido, do mais recente para trás: o primeiro da lista termina
    // no saldo de hoje, e cada anterior termina antes do efeito do seguinte.
    let depois = view.stock;
    const historico = movimentos.map((m) => {
      const linha = ConsumiveisService.movimentoParaView(m, depois);
      depois -= efeito(m.kind, m.quantity);
      return linha;
    });

    return { ...view, movements: historico };
  }

  async criar(usuario: UsuarioAutenticado, dto: EscreverConsumivelDto, ip?: string): Promise<ConsumivelDetail> {
    await this.exigirReferencias(usuario, dto);
    await this.exigirNomeLivre(usuario, dto.name);

    const item = await this.prisma.consumableItem.create({
      data: {
        organizationId: usuario.organizationId,
        name: dto.name.trim(),
        kind: dto.kind ?? 'CONSUMIVEL',
        reference: dto.reference?.trim() || null,
        manufacturerId: dto.manufacturerId ?? null,
        locationId: dto.locationId ?? null,
        minStock: dto.minStock ?? 0,
        unit: dto.unit?.trim() || 'un',
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
        compatibleModels: dto.compatibleModelIds?.length
          ? { create: [...new Set(dto.compatibleModelIds)].map((assetModelId) => ({ assetModelId })) }
          : undefined,
      },
    });

    await this.auditoria.registrar(usuario, {
      action: 'consumivel.criado',
      entity: 'ConsumableItem',
      entityId: item.id,
      ip,
      depois: { name: item.name, kind: item.kind, reference: item.reference, minStock: item.minStock },
    });
    return this.detalhe(usuario, item.id);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarConsumivelDto,
    ip?: string,
  ): Promise<ConsumivelDetail> {
    const antes = await this.exigirItem(usuario, id);
    await this.exigirReferencias(usuario, dto);
    if (dto.name !== undefined) await this.exigirNomeLivre(usuario, dto.name, id);

    await this.prisma.$transaction([
      this.prisma.consumableItem.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          kind: dto.kind,
          reference: dto.reference === undefined ? undefined : dto.reference?.trim() || null,
          manufacturerId: dto.manufacturerId,
          locationId: dto.locationId,
          minStock: dto.minStock,
          unit: dto.unit?.trim() || undefined,
          notes: dto.notes,
          isActive: dto.isActive,
        },
      }),
      // A lista de compatíveis, quando vem, substitui a anterior inteira.
      ...(dto.compatibleModelIds
        ? [
            this.prisma.consumableItemModel.deleteMany({ where: { itemId: id } }),
            this.prisma.consumableItemModel.createMany({
              data: [...new Set(dto.compatibleModelIds)].map((assetModelId) => ({ itemId: id, assetModelId })),
            }),
          ]
        : []),
    ]);

    await this.auditoria.registrar(usuario, {
      action: 'consumivel.editado',
      entity: 'ConsumableItem',
      entityId: id,
      ip,
      antes: { name: antes.name, kind: antes.kind, minStock: antes.minStock, isActive: antes.isActive },
      depois: {
        name: dto.name ?? antes.name,
        kind: dto.kind ?? antes.kind,
        minStock: dto.minStock ?? antes.minStock,
        isActive: dto.isActive ?? antes.isActive,
      },
    });
    return this.detalhe(usuario, id);
  }

  /** Excluir só o que nunca teve movimento; com histórico, desativar. */
  async remover(usuario: UsuarioAutenticado, id: string, ip?: string): Promise<void> {
    const item = await this.exigirItem(usuario, id);
    const movimentos = await this.prisma.consumableMovement.count({ where: { itemId: id } });
    if (movimentos) {
      throw new ConflictException(`Este consumível tem ${movimentos} movimentação(ões): desative em vez de excluir.`);
    }
    await this.prisma.consumableItem.delete({ where: { id } });
    await this.auditoria.registrar(usuario, {
      action: 'consumivel.excluido',
      entity: 'ConsumableItem',
      entityId: id,
      ip,
      antes: { name: item.name },
    });
  }

  /**
   * Entrada, saída ou ajuste.
   *
   * Saída não deixa o saldo negativo — e a checagem e a gravação correm
   * com a linha do item travada (`FOR UPDATE`): duas pessoas tirando o
   * último toner ao mesmo tempo não viram saldo −1.
   */
  async movimentar(usuario: UsuarioAutenticado, id: string, dto: MovimentarDto, ip?: string): Promise<ConsumivelDetail> {
    if (dto.kind !== 'SAIDA' && !can(usuario.role, 'ativo:gerenciar')) {
      throw new ForbiddenException('Entrada e ajuste de estoque são de quem gerencia ativos.');
    }
    if (dto.kind === 'AJUSTE' ? dto.quantity === 0 : dto.quantity <= 0) {
      throw new BadRequestException(
        dto.kind === 'AJUSTE' ? 'Ajuste de zero não muda nada.' : 'A quantidade tem de ser maior que zero.',
      );
    }
    if (dto.kind !== 'SAIDA' && (dto.assetId || dto.userId)) {
      throw new BadRequestException('Equipamento e pessoa só valem na saída.');
    }

    const item = await this.exigirItem(usuario, id);
    if (dto.assetId) await this.exigirAtivo(usuario, dto.assetId);
    if (dto.userId) await this.exigirPessoa(usuario, dto.userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM consumable_items WHERE id = ${id}::uuid FOR UPDATE`;
      const grupos = await tx.consumableMovement.groupBy({
        by: ['kind'],
        where: { itemId: id },
        _sum: { quantity: true },
      });
      const saldo = grupos.reduce((soma, g) => soma + efeito(g.kind, g._sum.quantity ?? 0), 0);
      const novo = saldo + efeito(dto.kind, dto.quantity);
      if (novo < 0) {
        throw new ConflictException(`Estoque insuficiente: há ${saldo} ${item.unit} de ${item.name}.`);
      }
      await tx.consumableMovement.create({
        data: {
          organizationId: usuario.organizationId,
          itemId: id,
          kind: dto.kind,
          quantity: dto.quantity,
          assetId: dto.assetId ?? null,
          userId: dto.userId ?? null,
          note: dto.note ?? null,
          authorId: usuario.userId,
        },
      });
    });

    // Ajuste é quem mexe no saldo sem papel que o justifique: fica na trilha.
    if (dto.kind === 'AJUSTE') {
      await this.auditoria.registrar(usuario, {
        action: 'consumivel.ajuste',
        entity: 'ConsumableItem',
        entityId: id,
        ip,
        depois: { quantidade: dto.quantity, motivo: dto.note ?? null },
      });
    }
    return this.detalhe(usuario, id);
  }

  async doAtivo(usuario: UsuarioAutenticado, assetId: string): Promise<SuprimentosDoAtivo> {
    const ativo = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId: usuario.organizationId },
      select: { id: true, assetModelId: true },
    });
    if (!ativo) throw new NotFoundException('Equipamento não encontrado.');

    const base = { organizationId: usuario.organizationId, isActive: true };
    let compativeis = ativo.assetModelId
      ? await this.prisma.consumableItem.findMany({
          where: { ...base, compatibleModels: { some: { assetModelId: ativo.assetModelId } } },
          include: INCLUDE_ITEM,
          orderBy: { name: 'asc' },
        })
      : [];
    // Sem modelo (ou sem compatível cadastrado), oferece os toners todos:
    // melhor escolher na lista que não conseguir registrar a troca.
    if (compativeis.length === 0) {
      compativeis = await this.prisma.consumableItem.findMany({
        where: { ...base, kind: 'TONER' },
        include: INCLUDE_ITEM,
        orderBy: { name: 'asc' },
        take: 100,
      });
    }

    const [saldos, recentes] = await Promise.all([
      this.saldos(compativeis.map((i) => i.id)),
      this.prisma.consumableMovement.findMany({
        where: { assetId, organizationId: usuario.organizationId },
        include: { ...INCLUDE_MOVIMENTO, item: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      compatible: compativeis.map((i) => ConsumiveisService.paraView(i, saldos.get(i.id))),
      // O saldo depois do movimento não faz sentido fora do histórico do
      // item; aqui vai 0 e a tela não o mostra.
      recent: recentes.map((m) => ({ ...ConsumiveisService.movimentoParaView(m, 0), item: m.item })),
    };
  }

  // -------------------------------------------------------------------

  private async saldos(itemIds: string[]): Promise<Map<string, Saldo>> {
    const mapa = new Map<string, Saldo>();
    if (itemIds.length === 0) return mapa;
    const grupos = await this.prisma.consumableMovement.groupBy({
      by: ['itemId', 'kind'],
      where: { itemId: { in: itemIds } },
      _sum: { quantity: true },
      _max: { createdAt: true },
    });
    for (const g of grupos) {
      const atual = mapa.get(g.itemId) ?? { saldo: 0, ultimo: null };
      atual.saldo += efeito(g.kind, g._sum.quantity ?? 0);
      const quando = g._max.createdAt;
      if (quando && (!atual.ultimo || quando > atual.ultimo)) atual.ultimo = quando;
      mapa.set(g.itemId, atual);
    }
    return mapa;
  }

  private static paraView(i: ItemComRelacoes, saldo?: Saldo): ConsumivelView {
    const estoque = saldo?.saldo ?? 0;
    return {
      id: i.id,
      kind: i.kind,
      name: i.name,
      reference: i.reference,
      manufacturer: i.manufacturer,
      location: i.location,
      minStock: i.minStock,
      unit: i.unit,
      notes: i.notes,
      isActive: i.isActive,
      stock: estoque,
      belowMin: estoque <= i.minStock,
      compatibleModels: i.compatibleModels.map((c) => c.assetModel),
      lastMovementAt: saldo?.ultimo?.toISOString() ?? null,
    };
  }

  private static movimentoParaView(m: MovimentoComRelacoes, saldoDepois: number): MovimentoView {
    return {
      id: m.id,
      kind: m.kind,
      quantity: m.quantity,
      stockAfter: saldoDepois,
      asset: m.asset,
      user: m.user,
      author: m.author,
      note: m.note,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private async exigirItem(usuario: UsuarioAutenticado, id: string) {
    const item = await this.prisma.consumableItem.findFirst({ where: { id, organizationId: usuario.organizationId } });
    if (!item) throw new NotFoundException('Consumível não encontrado.');
    return item;
  }

  private async exigirNomeLivre(usuario: UsuarioAutenticado, nome: string, ignorarId?: string): Promise<void> {
    const existente = await this.prisma.consumableItem.findFirst({
      where: {
        organizationId: usuario.organizationId,
        name: { equals: nome.trim(), mode: 'insensitive' },
        ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
      },
      select: { name: true },
    });
    if (existente) throw new ConflictException(`Já existe o consumível "${existente.name}".`);
  }

  private async exigirAtivo(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const existe = await this.prisma.asset.count({ where: { id, organizationId: usuario.organizationId } });
    if (!existe) throw new NotFoundException('Equipamento não encontrado.');
  }

  private async exigirPessoa(usuario: UsuarioAutenticado, userId: string): Promise<void> {
    const existe = await this.prisma.membership.count({ where: { userId, organizationId: usuario.organizationId } });
    if (!existe) throw new NotFoundException('Pessoa não encontrada nesta organização.');
  }

  private async exigirReferencias(
    usuario: UsuarioAutenticado,
    dto: { manufacturerId?: string | null; locationId?: string | null; compatibleModelIds?: string[] },
  ): Promise<void> {
    const organizationId = usuario.organizationId;
    if (dto.manufacturerId && !(await this.prisma.manufacturer.count({ where: { id: dto.manufacturerId, organizationId } }))) {
      throw new NotFoundException('Fabricante não encontrado nesta organização.');
    }
    if (dto.locationId && !(await this.prisma.location.count({ where: { id: dto.locationId, organizationId } }))) {
      throw new NotFoundException('Localização não encontrada nesta organização.');
    }
    const modelos = [...new Set(dto.compatibleModelIds ?? [])];
    if (modelos.length) {
      const achados = await this.prisma.assetModel.count({ where: { id: { in: modelos }, organizationId } });
      if (achados !== modelos.length) throw new NotFoundException('Modelo de equipamento não encontrado nesta organização.');
    }
  }
}
