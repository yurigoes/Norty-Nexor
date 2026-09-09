import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AssetView } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import type { BuscarAtivosDto, EditarAtivoDto, EscreverAtivoDto } from './dto';

const INCLUDE = {
  user: true,
  manufacturer: { select: { id: true, name: true } },
  assetModel: { select: { id: true, name: true } },
  location: { select: { id: true, name: true, parentId: true } },
  _count: { select: { tickets: true } },
} satisfies Prisma.AssetInclude;

type AtivoComRelacoes = Prisma.AssetGetPayload<{ include: typeof INCLUDE }>;

/**
 * Ativos.
 *
 * Deliberadamente **não é CMDB**. O inventário do GLPI são 60 tabelas e
 * um agente de coleta; a pergunta que o suporte faz na abertura do
 * chamado é só "qual máquina é essa?". Resolver essa pergunta com um
 * registro simples é o que faz o campo ser preenchido — o inventário
 * completo vira importação na Fase 6 (`docs/10-roadmap.md`).
 */
@Injectable()
export class AtivosService {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(usuario: UsuarioAutenticado, filtro: BuscarAtivosDto): Promise<AssetView[]> {
    const limite = filtro.limit ?? 50;
    const termo = filtro.q?.trim();

    const onde: Prisma.AssetWhereInput = {
      organizationId: usuario.organizationId,
      ...(filtro.kind ? { kind: filtro.kind } : {}),
      ...(filtro.status ? { status: filtro.status } : {}),
      ...(filtro.userId ? { userId: filtro.userId } : {}),
      ...(filtro.locationId ? { locationId: filtro.locationId } : {}),
      ...(termo
        ? {
            // `contains` e não busca de texto: o suporte procura por
            // pedaço de patrimônio ("...4721") e por série incompleta,
            // e nenhum dos dois é palavra que o `to_tsvector` reconheça.
            OR: [
              { name: { contains: termo, mode: 'insensitive' } },
              { tag: { contains: termo, mode: 'insensitive' } },
              { serialNumber: { contains: termo, mode: 'insensitive' } },
              { assetModel: { name: { contains: termo, mode: 'insensitive' } } },
              { manufacturer: { name: { contains: termo, mode: 'insensitive' } } },
              { location: { name: { contains: termo, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const ativos = await this.prisma.asset.findMany({
      where: onde,
      include: INCLUDE,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      take: limite,
    });

    return this.comCaminho(usuario.organizationId, ativos);
  }

  async obter(usuario: UsuarioAutenticado, id: string): Promise<AssetView> {
    const ativo = await this.prisma.asset.findFirst({
      where: { id, organizationId: usuario.organizationId },
      include: INCLUDE,
    });

    if (!ativo) throw new NotFoundException('Ativo não encontrado.');
    const [view] = await this.comCaminho(usuario.organizationId, [ativo]);
    return view!;
  }

  /** O histórico do equipamento: é o que responde "essa máquina dá problema?". */
  async chamadosDoAtivo(usuario: UsuarioAutenticado, id: string) {
    await this.obter(usuario, id);

    const vinculos = await this.prisma.ticketAsset.findMany({
      where: {
        assetId: id,
        // O escopo de leitura vale aqui também: o histórico do ativo não
        // é uma porta lateral para ler chamado que não é seu.
        ticket: escopoDeLeitura(usuario),
      },
      include: {
        ticket: {
          select: { id: true, number: true, subject: true, status: true, createdAt: true },
        },
      },
      orderBy: { addedAt: 'desc' },
      take: 100,
    });

    return vinculos.map((v) => ({
      id: v.ticket.id,
      number: v.ticket.number,
      subject: v.ticket.subject,
      status: v.ticket.status,
      createdAt: v.ticket.createdAt.toISOString(),
    }));
  }

  async criar(usuario: UsuarioAutenticado, dto: EscreverAtivoDto): Promise<AssetView> {
    await this.exigirUsuarioDaOrganizacao(usuario, dto.userId);
    await this.exigirCatalogo(usuario, dto);

    try {
      const ativo = await this.prisma.asset.create({
        data: {
          organizationId: usuario.organizationId,
          name: dto.name,
          kind: dto.kind ?? 'OUTRO',
          status: dto.status ?? 'EM_USO',
          tag: dto.tag ?? null,
          serialNumber: dto.serialNumber ?? null,
          manufacturerId: dto.manufacturerId ?? null,
          assetModelId: dto.assetModelId ?? null,
          locationId: dto.locationId ?? null,
          notes: dto.notes ?? null,
          userId: dto.userId ?? null,
          purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : null,
          warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : null,
        },
        include: INCLUDE,
      });

      const [view] = await this.comCaminho(usuario.organizationId, [ativo]);
      return view!;
    } catch (erro) {
      throw AtivosService.traduzirDuplicidade(erro);
    }
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarAtivoDto,
  ): Promise<AssetView> {
    await this.obter(usuario, id);
    await this.exigirUsuarioDaOrganizacao(usuario, dto.userId);
    await this.exigirCatalogo(usuario, dto);

    try {
      const ativo = await this.prisma.asset.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.tag !== undefined ? { tag: dto.tag } : {}),
          ...(dto.serialNumber !== undefined ? { serialNumber: dto.serialNumber } : {}),
          ...(dto.manufacturerId !== undefined ? { manufacturerId: dto.manufacturerId } : {}),
          ...(dto.assetModelId !== undefined ? { assetModelId: dto.assetModelId } : {}),
          ...(dto.locationId !== undefined ? { locationId: dto.locationId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
          ...(dto.purchasedAt !== undefined
            ? { purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : null }
            : {}),
          ...(dto.warrantyUntil !== undefined
            ? { warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : null }
            : {}),
        },
        include: INCLUDE,
      });

      const [view] = await this.comCaminho(usuario.organizationId, [ativo]);
      return view!;
    } catch (erro) {
      throw AtivosService.traduzirDuplicidade(erro);
    }
  }

  // -------------------------------------------------------------------
  // Vínculo com o chamado
  // -------------------------------------------------------------------

  async vincular(usuario: UsuarioAutenticado, ticketId: string, assetId: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    await this.obter(usuario, assetId);

    await this.prisma.ticketAsset.upsert({
      where: { ticketId_assetId: { ticketId, assetId } },
      create: { ticketId, assetId },
      update: {},
    });

    return this.doChamado(usuario, ticketId);
  }

  async desvincular(usuario: UsuarioAutenticado, ticketId: string, assetId: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    await this.prisma.ticketAsset
      .delete({ where: { ticketId_assetId: { ticketId, assetId } } })
      .catch(() => undefined);

    return this.doChamado(usuario, ticketId);
  }

  async doChamado(usuario: UsuarioAutenticado, ticketId: string): Promise<AssetView[]> {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    const vinculos = await this.prisma.ticketAsset.findMany({
      where: { ticketId },
      include: { asset: { include: INCLUDE } },
      orderBy: { addedAt: 'asc' },
    });

    return this.comCaminho(
      usuario.organizationId,
      vinculos.map((v) => v.asset),
    );
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  /**
   * Monta o caminho da localização de cada ativo.
   *
   * A árvore de uma organização cabe numa consulta, e uma consulta
   * resolve a lista inteira: subir a árvore por ativo seria o N+1 numa
   * tela que sempre lista dezenas. Por isso o caminho não é gravado —
   * ele não custa o bastante para valer mais uma coisa a atualizar
   * quando alguém renomeia o prédio.
   */
  private async comCaminho(
    organizationId: string,
    ativos: AtivoComRelacoes[],
  ): Promise<AssetView[]> {
    const temLocal = ativos.some((a) => a.locationId);
    const caminhos = temLocal ? await this.caminhosDaOrganizacao(organizationId) : new Map();

    return ativos.map((a) => AtivosService.paraView(a, caminhos));
  }

  /** `id → "Prédio A > 2º andar > Sala 201"`, para a organização inteira. */
  async caminhosDaOrganizacao(organizationId: string): Promise<Map<string, string>> {
    const locais = await this.prisma.location.findMany({
      where: { organizationId },
      select: { id: true, name: true, parentId: true },
    });

    const porId = new Map(locais.map((l) => [l.id, l]));
    const caminhos = new Map<string, string>();

    const montar = (id: string, visitados = new Set<string>()): string => {
      const pronto = caminhos.get(id);
      if (pronto) return pronto;

      const local = porId.get(id);
      if (!local) return '';

      // Ciclo no banco não pode virar laço infinito aqui: a unicidade
      // impede a árvore de fechar, mas uma edição malfeita por SQL não.
      if (visitados.has(id)) return local.name;
      visitados.add(id);

      const caminho = local.parentId
        ? `${montar(local.parentId, visitados)} > ${local.name}`
        : local.name;

      caminhos.set(id, caminho);
      return caminho;
    };

    for (const local of locais) montar(local.id);
    return caminhos;
  }

  /** Localização, fabricante e modelo têm de ser da organização. */
  private async exigirCatalogo(
    usuario: UsuarioAutenticado,
    dto: { manufacturerId?: string | null; assetModelId?: string | null; locationId?: string | null },
  ): Promise<void> {
    const organizationId = usuario.organizationId;

    if (dto.manufacturerId) {
      const existe = await this.prisma.manufacturer.count({
        where: { id: dto.manufacturerId, organizationId },
      });
      if (!existe) throw new NotFoundException('Fabricante não encontrado nesta organização.');
    }

    if (dto.assetModelId) {
      const existe = await this.prisma.assetModel.count({
        where: { id: dto.assetModelId, organizationId },
      });
      if (!existe) throw new NotFoundException('Modelo não encontrado nesta organização.');
    }

    if (dto.locationId) {
      const existe = await this.prisma.location.count({
        where: { id: dto.locationId, organizationId },
      });
      if (!existe) throw new NotFoundException('Localização não encontrada nesta organização.');
    }
  }

  private async exigirUsuarioDaOrganizacao(
    usuario: UsuarioAutenticado,
    userId?: string | null,
  ): Promise<void> {
    if (!userId) return;

    const pessoa = await this.prisma.user.findFirst({
      where: {
        id: userId,
        memberships: { some: { organizationId: usuario.organizationId } },
      },
      select: { id: true },
    });

    if (!pessoa) throw new NotFoundException('Pessoa não encontrada nesta organização.');
  }

  /**
   * Patrimônio repetido é erro de gente, não do sistema.
   *
   * A mensagem do Postgres não serve para o operador: ela diz o nome da
   * restrição. Aqui ele lê qual campo colidiu.
   */
  private static traduzirDuplicidade(erro: unknown): unknown {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === 'P2002'
    ) {
      const alvo = (erro.meta?.target as string[] | undefined)?.join(', ') ?? '';
      const campo = alvo.includes('serialNumber') ? 'número de série' : 'patrimônio';

      return new ConflictException(
        `Já existe um ativo com este ${campo}. Dois registros do mesmo equipamento ` +
          'são a origem de metade da sujeira de inventário.',
      );
    }

    return erro;
  }

  private static paraView(
    ativo: AtivoComRelacoes,
    caminhos: Map<string, string>,
  ): AssetView {
    return {
      id: ativo.id,
      kind: ativo.kind,
      status: ativo.status,
      name: ativo.name,
      tag: ativo.tag,
      serialNumber: ativo.serialNumber,
      manufacturer: ativo.manufacturer,
      assetModel: ativo.assetModel,
      location: ativo.location
        ? {
            id: ativo.location.id,
            name: ativo.location.name,
            path: caminhos.get(ativo.location.id) ?? ativo.location.name,
          }
        : null,
      user: ativo.user
        ? { kind: 'USER', id: ativo.user.id, name: ativo.user.name, email: ativo.user.email }
        : null,
      purchasedAt: ativo.purchasedAt?.toISOString() ?? null,
      warrantyUntil: ativo.warrantyUntil?.toISOString() ?? null,
      notes: ativo.notes,
      ticketCount: ativo._count.tickets,
    };
  }
}
