import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AssetDetail, AssetView, ComponentKind, ComponenteView } from '@norty-desk/shared';
import { deClientesDiferentes, validarAtributos } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import { PosseService } from './posse.service';
import type {
  BuscarAtivosDto,
  EditarAtivoDto,
  EditarComponenteDto,
  EscreverAtivoDto,
  EscreverComponenteDto,
} from './dto';

/** O `AtivoRef` do domínio compartilhado, do lado do Prisma. */
const REF = { select: { id: true, name: true, tag: true } } as const;

const INCLUDE = {
  user: true,
  parent: REF,
  client: { select: { id: true, name: true } },
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
/** A forma de um uuid. Serve para decidir se vale procurar por id. */
const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AtivosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posse: PosseService,
  ) {}

  async buscar(usuario: UsuarioAutenticado, filtro: BuscarAtivosDto): Promise<AssetView[]> {
    const limite = filtro.limit ?? 50;
    const termo = filtro.q?.trim();

    const onde: Prisma.AssetWhereInput = {
      organizationId: usuario.organizationId,
      ...(filtro.kind ? { kind: filtro.kind } : {}),
      ...(filtro.status ? { status: filtro.status } : {}),
      ...(filtro.userId ? { userId: filtro.userId } : {}),
      ...(filtro.parentAssetId ? { parentAssetId: filtro.parentAssetId } : {}),
      // `semCliente` e `clientId` respondem perguntas diferentes: "o
      // parque da empresa do João" e "o que é nosso". O primeiro ganha
      // quando os dois vêm, porque é o mais específico.
      ...(filtro.clientId
        ? { clientId: filtro.clientId }
        : filtro.semCliente
          ? { clientId: null }
          : {}),
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
              // O id inteiro, quando é o que foi colado. Um `contains`
              // sobre `uuid` o Postgres recusa — o tipo não é texto —,
              // então entra como igualdade e só quando a forma bate.
              ...(EH_UUID.test(termo) ? [{ id: termo }] : []),
              // O IP do Tailscale: quem tem o IP na mão e quer saber de
              // que máquina ele é faz exatamente esta pergunta.
              { tailscaleIp: termo },
              { remoteAccessId: termo },
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

  /** O ativo com o que pendura nele, o que tem dentro, e por que mãos passou. */
  async detalhe(usuario: UsuarioAutenticado, id: string): Promise<AssetDetail> {
    const [ativo, componentes, perifericos, posses] = await Promise.all([
      this.obter(usuario, id),
      this.componentes(usuario, id),
      this.prisma.asset.findMany({
        where: { parentAssetId: id, organizationId: usuario.organizationId },
        ...REF,
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      }),
      this.posse.listar(usuario, id),
    ]);

    return {
      ...ativo,
      components: componentes,
      peripherals: perifericos,
      holdings: posses,
    };
  }

  // -------------------------------------------------------------------
  // Componentes
  // -------------------------------------------------------------------

  async componentes(usuario: UsuarioAutenticado, assetId: string): Promise<ComponenteView[]> {
    const componentes = await this.prisma.assetComponent.findMany({
      where: { assetId, organizationId: usuario.organizationId },
      include: { manufacturer: { select: { id: true, name: true } } },
      // Pelo tipo e depois pela ordem de entrada: os dois pentes de
      // memória saem juntos, e o segundo sai depois do primeiro.
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });

    return componentes.map(AtivosService.componenteParaView);
  }

  async adicionarComponente(
    usuario: UsuarioAutenticado,
    assetId: string,
    dto: EscreverComponenteDto,
  ): Promise<ComponenteView[]> {
    await this.obter(usuario, assetId);
    await this.exigirFabricante(usuario, dto.manufacturerId);

    const atributos = AtivosService.exigirFicha(dto.kind, dto.attributes);

    try {
      await this.prisma.assetComponent.create({
        data: {
          organizationId: usuario.organizationId,
          assetId,
          kind: dto.kind,
          name: dto.name,
          manufacturerId: dto.manufacturerId ?? null,
          serialNumber: dto.serialNumber ?? null,
          attributes: atributos,
          notes: dto.notes ?? null,
        },
      });
    } catch (erro) {
      throw AtivosService.traduzirSerieDePeca(erro);
    }

    return this.componentes(usuario, assetId);
  }

  async editarComponente(
    usuario: UsuarioAutenticado,
    assetId: string,
    componentId: string,
    dto: EditarComponenteDto,
  ): Promise<ComponenteView[]> {
    const atual = await this.prisma.assetComponent.findFirst({
      where: { id: componentId, assetId, organizationId: usuario.organizationId },
    });
    if (!atual) throw new NotFoundException('Componente não encontrado neste ativo.');

    await this.exigirFabricante(usuario, dto.manufacturerId);

    // Trocar o tipo troca a ficha inteira: os atributos do tipo antigo
    // não valem no novo, e guardá-los "por via das dúvidas" deixaria
    // uma frequência de memória escondida dentro de um disco.
    const kind = dto.kind ?? atual.kind;
    const atributos =
      dto.attributes === undefined && kind === atual.kind
        ? (atual.attributes as Prisma.InputJsonObject)
        : AtivosService.exigirFicha(kind, dto.attributes);

    try {
      await this.prisma.assetComponent.update({
        where: { id: componentId },
        data: {
          kind,
          attributes: atributos,
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.manufacturerId === undefined ? {} : { manufacturerId: dto.manufacturerId }),
          ...(dto.serialNumber === undefined ? {} : { serialNumber: dto.serialNumber }),
          ...(dto.notes === undefined ? {} : { notes: dto.notes }),
        },
      });
    } catch (erro) {
      throw AtivosService.traduzirSerieDePeca(erro);
    }

    return this.componentes(usuario, assetId);
  }

  async removerComponente(
    usuario: UsuarioAutenticado,
    assetId: string,
    componentId: string,
  ): Promise<ComponenteView[]> {
    const componente = await this.prisma.assetComponent.findFirst({
      where: { id: componentId, assetId, organizationId: usuario.organizationId },
      select: { id: true },
    });
    if (!componente) throw new NotFoundException('Componente não encontrado neste ativo.');

    await this.prisma.assetComponent.delete({ where: { id: componentId } });

    return this.componentes(usuario, assetId);
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
    await this.exigirCatalogo(usuario, dto);
    await this.exigirCliente(usuario, dto.clientId);
    await this.exigirPaiValido(usuario, dto.parentAssetId, null, dto.clientId ?? null);

    try {
      const ativo = await this.prisma.asset.create({
        data: {
          organizationId: usuario.organizationId,
          clientId: dto.clientId ?? null,
          name: dto.name,
          kind: dto.kind ?? 'OUTRO',
          status: dto.status ?? 'EM_USO',
          tag: dto.tag ?? null,
          serialNumber: dto.serialNumber ?? null,
          manufacturerId: dto.manufacturerId ?? null,
          assetModelId: dto.assetModelId ?? null,
          locationId: dto.locationId ?? null,
          notes: dto.notes ?? null,
          parentAssetId: dto.parentAssetId ?? null,
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
    const atual = await this.obter(usuario, id);
    await this.exigirCatalogo(usuario, dto);
    await this.exigirCliente(usuario, dto.clientId);

    // O cliente depois desta edição é quem manda nas coerências abaixo:
    // conferir contra o de antes deixaria passar a troca de empresa que
    // contradiz o pai ou quem está com o equipamento.
    const clienteFinal = dto.clientId !== undefined ? dto.clientId : (atual.client?.id ?? null);

    await this.exigirPaiValido(usuario, dto.parentAssetId, id, clienteFinal);
    if (dto.clientId !== undefined) await this.exigirTrocaDeClienteCoerente(id, clienteFinal);

    try {
      const ativo = await this.prisma.asset.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.clientId !== undefined ? { clientId: dto.clientId } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.tag !== undefined ? { tag: dto.tag } : {}),
          ...(dto.serialNumber !== undefined ? { serialNumber: dto.serialNumber } : {}),
          ...(dto.manufacturerId !== undefined ? { manufacturerId: dto.manufacturerId } : {}),
          ...(dto.assetModelId !== undefined ? { assetModelId: dto.assetModelId } : {}),
          ...(dto.locationId !== undefined ? { locationId: dto.locationId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.parentAssetId !== undefined ? { parentAssetId: dto.parentAssetId } : {}),
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

  /**
   * O equipamento em que o periférico vai pendurar.
   *
   * Três recusas, e cada uma existe por um estrago diferente:
   *
   * - **Outra organização.** Um id vindo do corpo da requisição não
   *   prova nada; sem esta conferência, dava para pendurar o teclado
   *   numa máquina de outra empresa e ler o nome dela no detalhe.
   * - **Ele mesmo.** O banco também barra, por `CHECK` — aqui a recusa
   *   vem em português, em vez de um erro de constraint.
   * - **Um pai que já tem pai.** É o que segura o nível único. Sem
   *   isso a corrente cresce, "o que está nesta máquina?" vira busca
   *   recursiva, e o inventário passa a ter uma árvore que ninguém
   *   mantém.
   */
  private async exigirPaiValido(
    usuario: UsuarioAutenticado,
    parentAssetId: string | null | undefined,
    filhoId: string | null,
    clienteDoFilho: string | null,
  ): Promise<void> {
    if (!parentAssetId) return;

    if (filhoId && parentAssetId === filhoId) {
      throw new BadRequestException('Um equipamento não pendura em si mesmo.');
    }

    const pai = await this.prisma.asset.findFirst({
      where: { id: parentAssetId, organizationId: usuario.organizationId },
      select: { id: true, name: true, parentAssetId: true, clientId: true },
    });

    if (!pai) throw new BadRequestException('Equipamento não encontrado nesta organização.');

    if (pai.parentAssetId) {
      throw new BadRequestException(
        `${pai.name} já está pendurado noutro equipamento. ` +
          'Periférico pendura direto na máquina, e não noutro periférico.',
      );
    }

    if (deClientesDiferentes(clienteDoFilho, pai.clientId)) {
      throw new BadRequestException(
        `${pai.name} é de outra empresa. Um periférico não pendura no ` +
          'equipamento de outro cliente — o parque de cada um tem de fechar sozinho.',
      );
    }
  }

  /**
   * A empresa-cliente dona do equipamento.
   *
   * Um id vindo do corpo da requisição não prova nada: sem esta
   * conferência dava para cadastrar equipamento na carteira de outra
   * organização e ler o nome dela de volta no detalhe.
   */
  private async exigirCliente(
    usuario: UsuarioAutenticado,
    clientId: string | null | undefined,
  ): Promise<void> {
    if (!clientId) return;

    const existe = await this.prisma.client.count({
      where: { id: clientId, organizationId: usuario.organizationId },
    });

    if (!existe) throw new BadRequestException('Empresa não encontrada nesta organização.');
  }

  /**
   * Trocar o equipamento de empresa não pode contradizer o que já existe.
   *
   * São dois estragos diferentes, e por isso duas recusas:
   *
   * - **Periférico de outra empresa pendurado nele.** Mover a máquina
   *   deixaria o teclado da empresa do João dentro do parque da empresa
   *   da Maria, e nenhuma das duas contagens fecharia.
   * - **Está na mão de alguém de outra empresa.** A posse aberta ficaria
   *   dizendo que um funcionário da empresa antiga está com equipamento
   *   da nova. Devolver primeiro é o gesto certo, e é o que a mensagem
   *   pede.
   */
  private async exigirTrocaDeClienteCoerente(
    assetId: string,
    clienteNovo: string | null,
  ): Promise<void> {
    const [perifericoAlheio, posseAberta] = await Promise.all([
      this.prisma.asset.findFirst({
        where: {
          parentAssetId: assetId,
          ...(clienteNovo === null ? { NOT: { clientId: null } } : { NOT: { clientId: clienteNovo } }),
        },
        select: { name: true },
      }),
      this.prisma.assetHolding.findFirst({
        where: { assetId, endedAt: null },
        select: { user: { select: { name: true, memberships: { select: { clientId: true } } } } },
      }),
    ]);

    if (perifericoAlheio) {
      throw new BadRequestException(
        `${perifericoAlheio.name} está pendurado neste equipamento e é de outra empresa. ` +
          'Despendure antes de trocar a empresa.',
      );
    }

    if (!posseAberta) return;

    // "De outra empresa" é ter vínculo de cliente e nenhum deles bater.
    // Quem é da casa (vínculo sem cliente) segura equipamento de
    // qualquer um: é o técnico que levou a máquina para o conserto.
    const clientesDaPessoa = posseAberta.user.memberships.map((m) => m.clientId);
    const daCasa = clientesDaPessoa.some((c) => c === null);

    if (!daCasa && !clientesDaPessoa.includes(clienteNovo)) {
      throw new BadRequestException(
        `${posseAberta.user.name} está com este equipamento e é de outra empresa. ` +
          'Registre a devolução antes de trocar a empresa.',
      );
    }
  }

  private async exigirFabricante(
    usuario: UsuarioAutenticado,
    manufacturerId: string | null | undefined,
  ): Promise<void> {
    if (!manufacturerId) return;

    const existe = await this.prisma.manufacturer.count({
      where: { id: manufacturerId, organizationId: usuario.organizationId },
    });
    if (!existe) throw new BadRequestException('Fabricante não encontrado nesta organização.');
  }

  /**
   * A ficha do tipo, validada — ou 400 com o campo que está errado.
   *
   * A validação é a mesma do formulário dinâmico, e por isso a mensagem
   * também é: "Capacidade é obrigatório" diz mais que "attributes
   * inválido", e é a mesma frase que a tela mostraria se a pessoa
   * tivesse deixado o campo em branco.
   */
  private static exigirFicha(
    kind: ComponentKind,
    atributos: Record<string, unknown> | undefined,
  ): Prisma.InputJsonObject {
    const ficha = atributos ?? {};
    const erros = validarAtributos(kind, ficha);

    if (erros.length > 0) {
      throw new BadRequestException(erros.map((e) => e.mensagem).join(' '));
    }

    // A conversão acontece aqui, depois da validação, e só aqui: o que
    // passou por `validarAtributos` é texto, número, booleano, data ou
    // lista de opções — tudo que o JSON do Postgres aceita.
    return ficha as Prisma.InputJsonObject;
  }

  private static traduzirSerieDePeca(erro: unknown): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException(
        'Já existe uma peça com este número de série. Duas linhas com a mesma ' +
          'série são a mesma peça contada duas vezes — é assim que a memória da ' +
          'frota dobra sozinha.',
      );
    }

    return erro;
  }

  private static componenteParaView(c: {
    id: string;
    kind: ComponentKind;
    name: string;
    manufacturer: { id: string; name: string } | null;
    serialNumber: string | null;
    attributes: unknown;
    notes: string | null;
    createdAt: Date;
  }): ComponenteView {
    return {
      id: c.id,
      kind: c.kind,
      name: c.name,
      manufacturer: c.manufacturer,
      serialNumber: c.serialNumber,
      attributes: (c.attributes ?? {}) as Record<string, unknown>,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
    };
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
      client: ativo.client,
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
      hostname: ativo.hostname,
      osName: ativo.osName,
      osVersion: ativo.osVersion,
      lastSeenAt: ativo.lastSeenAt?.toISOString() ?? null,
      agentVersion: ativo.agentVersion,
      parent: ativo.parent,
      ticketCount: ativo._count.tickets,
    };
  }
}
