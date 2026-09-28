import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BuscaSalvaView, Compartilhamento, FiltroSalvavel } from '@norty-desk/shared';
import { can } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AtualizarBuscaSalvaDto, CriarBuscaSalvaDto } from './dto';

/**
 * Quantas buscas salvas uma pessoa pode ter.
 *
 * Conta só as **próprias**: as do time e as da casa não são dela, e
 * deixá-las no teto faria o gerente que compartilhou cinco visões
 * consumir a cota de quem só as recebe.
 *
 * Teto porque são abas: trinta já não cabem na tela. Quem precisa de cem
 * filtros nomeados precisa de relatório, não de aba.
 */
const MAX_POR_PESSOA = 30;

/** O que a listagem precisa carregar para montar a view. */
const COM_DONO = {
  team: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
} as const;

/**
 * As buscas salvas que cada pessoa vê.
 *
 * O que o GLPI chama de *saved search*: um nome, um filtro da fila, uma
 * ordem, e com quem ela é compartilhada.
 *
 * **A busca salva não dá acesso a nada.** Ela é um filtro; quem decide
 * quais chamados a pessoa vê é o escopo de leitura da fila
 * (`chamado:ler:proprios` / `:time` / `:todos`), aplicado depois. A busca
 * do time mostra, para cada um, o que aquele um já podia ver — e é por
 * isso que compartilhá-la é seguro mesmo entre papéis diferentes.
 */
@Injectable()
export class BuscasSalvasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * As que esta pessoa enxerga: as dela, as dos times dela, as da casa.
   *
   * As próprias vêm primeiro. A aba que a pessoa criou é a que ela
   * procura com o olho, e empurrá-la para depois das cinco da casa seria
   * punir quem organiza o próprio dia.
   */
  async listar(usuario: UsuarioAutenticado): Promise<BuscaSalvaView[]> {
    const [buscas, padrao] = await Promise.all([
      this.prisma.savedSearch.findMany({
        where: BuscasSalvasService.visiveis(usuario),
        include: COM_DONO,
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.savedSearchDefault.findUnique({
        where: {
          organizationId_userId: {
            organizationId: usuario.organizationId,
            userId: usuario.userId,
          },
        },
        select: { savedSearchId: true },
      }),
    ]);

    const minhas = buscas.filter((b) => b.userId === usuario.userId);
    const dosOutros = buscas.filter((b) => b.userId !== usuario.userId);

    return [...minhas, ...dosOutros].map((b) =>
      BuscasSalvasService.paraView(b, usuario, padrao?.savedSearchId),
    );
  }

  async criar(usuario: UsuarioAutenticado, dto: CriarBuscaSalvaDto): Promise<BuscaSalvaView[]> {
    const minhas = await this.prisma.savedSearch.count({
      where: { organizationId: usuario.organizationId, userId: usuario.userId },
    });

    if (minhas >= MAX_POR_PESSOA) {
      throw new BadRequestException(
        `Você já tem ${MAX_POR_PESSOA} buscas salvas, que é o limite. ` +
          'Apague uma que não usa mais para salvar esta.',
      );
    }

    const alcance = dto.shareKind ?? 'PRIVADA';
    await this.exigirAlcancePermitido(usuario, alcance, dto.teamId ?? null);

    // A nova entra no fim. Quem quiser outra ordem arrasta depois — e
    // colocá-la no começo empurraria a aba em que a pessoa estava.
    const ultima = await this.prisma.savedSearch.aggregate({
      where: { organizationId: usuario.organizationId, userId: usuario.userId },
      _max: { position: true },
    });

    const nome = dto.name.trim().replace(/\s+/g, ' ');

    try {
      await this.prisma.$transaction(async (tx) => {
        const criada = await tx.savedSearch.create({
          data: {
            organizationId: usuario.organizationId,
            userId: usuario.userId,
            name: nome,
            query: BuscasSalvasService.paraJson(dto.filtro),
            position: (ultima._max.position ?? -1) + 1,
            shareKind: alcance,
            teamId: alcance === 'TIME' ? dto.teamId! : null,
          },
          select: { id: true },
        });

        if (dto.isDefault) await BuscasSalvasService.marcarPadrao(tx, usuario, criada.id);
      });
    } catch (erro) {
      throw BuscasSalvasService.traduzir(erro, nome);
    }

    return this.listar(usuario);
  }

  /**
   * Muda a busca.
   *
   * Duas autorizações diferentes, e a diferença é o ponto:
   *
   * - **`isDefault` é de quem pede.** Marcar a busca do time como a que
   *   abre a minha fila é preferência minha, e não mexe na busca.
   * - **Nome, filtro e alcance são do dono.** A busca do time é do
   *   gerente que a criou; quem a recebe usa, não reescreve.
   */
  async atualizar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: AtualizarBuscaSalvaDto,
  ): Promise<BuscaSalvaView[]> {
    const busca = await this.aoAlcance(usuario, id);

    const mudaABusca =
      dto.name !== undefined || dto.filtro !== undefined || dto.shareKind !== undefined;

    if (mudaABusca && busca.userId !== usuario.userId) {
      throw new ForbiddenException(
        'Esta busca é de quem a compartilhou. Você pode usá-la e marcá-la como padrão, ' +
          'mas para mudá-la salve uma cópia sua.',
      );
    }

    const alcance = dto.shareKind ?? (busca.shareKind as Compartilhamento);
    const time = dto.shareKind === undefined && dto.teamId === undefined ? busca.teamId : dto.teamId;

    if (mudaABusca) await this.exigirAlcancePermitido(usuario, alcance, time ?? null);

    const nome = dto.name?.trim().replace(/\s+/g, ' ');

    try {
      await this.prisma.$transaction(async (tx) => {
        if (mudaABusca) {
          await tx.savedSearch.update({
            where: { id },
            data: {
              ...(nome === undefined ? {} : { name: nome }),
              ...(dto.filtro === undefined
                ? {}
                : { query: BuscasSalvasService.paraJson(dto.filtro) }),
              ...(dto.shareKind === undefined
                ? {}
                : { shareKind: alcance, teamId: alcance === 'TIME' ? time! : null }),
            },
          });
        }

        if (dto.isDefault === true) await BuscasSalvasService.marcarPadrao(tx, usuario, id);
        if (dto.isDefault === false) await BuscasSalvasService.limparPadrao(tx, usuario, id);
      });
    } catch (erro) {
      throw BuscasSalvasService.traduzir(erro, nome ?? '');
    }

    return this.listar(usuario);
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<BuscaSalvaView[]> {
    const busca = await this.aoAlcance(usuario, id);

    if (busca.userId !== usuario.userId) {
      throw new ForbiddenException(
        'Esta busca é de quem a compartilhou. Só quem a criou pode apagá-la.',
      );
    }

    // A cascata de `saved_search_defaults` tira a marca de padrão de
    // todo mundo que a tinha escolhido — inclusive de quem não é dono.
    await this.prisma.savedSearch.delete({ where: { id } });

    return this.listar(usuario);
  }

  /**
   * A nova ordem, pela lista inteira.
   *
   * Só as **próprias**: a posição de uma busca compartilhada é a que o
   * dono deu, e deixar cada um reordenar a do outro exigiria uma tabela
   * de ordem por pessoa para resolver um problema que ninguém tem.
   */
  async reordenar(usuario: UsuarioAutenticado, ids: string[]): Promise<BuscaSalvaView[]> {
    const minhas = await this.prisma.savedSearch.findMany({
      where: { organizationId: usuario.organizationId, userId: usuario.userId },
      select: { id: true },
    });

    const meus = new Set(minhas.map((b) => b.id));
    const pedidos = new Set(ids);

    if (pedidos.size !== ids.length) {
      throw new BadRequestException('A ordem tem id repetido.');
    }

    if (ids.length !== meus.size || ids.some((id) => !meus.has(id))) {
      throw new BadRequestException(
        'A ordem tem de trazer todas as suas buscas salvas, e só as suas. ' +
          'A de um time é ordenada por quem a compartilhou.',
      );
    }

    await this.prisma.$transaction(
      ids.map((id, posicao) =>
        this.prisma.savedSearch.update({ where: { id }, data: { position: posicao } }),
      ),
    );

    return this.listar(usuario);
  }

  // -------------------------------------------------------------------

  /** O `where` de "o que esta pessoa enxerga". */
  private static visiveis(usuario: UsuarioAutenticado): Prisma.SavedSearchWhereInput {
    return {
      organizationId: usuario.organizationId,
      OR: [
        { userId: usuario.userId },
        { shareKind: 'ORGANIZACAO' },
        // Sem time nenhum, a lista de ids fica vazia e o `in` não casa
        // com nada — que é a resposta certa, não um erro.
        { shareKind: 'TIME', teamId: { in: usuario.teamIds } },
      ],
    };
  }

  /**
   * A busca existe e esta pessoa a enxerga.
   *
   * Enxergar não é poder mudar — quem decide isso é quem chamou. Aqui a
   * pergunta é só se ela tem o direito de saber que a busca existe: 404
   * para o que não enxerga, e não 403, porque 403 confirmaria o id.
   */
  private async aoAlcance(
    usuario: UsuarioAutenticado,
    id: string,
  ): Promise<{ userId: string; shareKind: string; teamId: string | null }> {
    const busca = await this.prisma.savedSearch.findFirst({
      where: { id, ...BuscasSalvasService.visiveis(usuario) },
      select: { userId: true, shareKind: true, teamId: true },
    });

    if (!busca) throw new NotFoundException('Busca salva não encontrada.');

    return busca;
  }

  /**
   * Quem pode compartilhar, e com quem.
   *
   * - **Privada**: qualquer um.
   * - **Time**: ser **gerente** dele (`TeamMember.isManager`). Quem
   *   responde pela fila do time é quem deve nomear as visões dela; um
   *   agente qualquer podendo criar aba para os colegas enche a barra de
   *   ideia de uma pessoa só. Quem tem a permissão da casa também pode,
   *   porque quem já pode compartilhar com todos pode com alguns.
   * - **Organização**: `chamado:busca-compartilhada`.
   */
  private async exigirAlcancePermitido(
    usuario: UsuarioAutenticado,
    alcance: Compartilhamento,
    teamId: string | null,
  ): Promise<void> {
    if (alcance === 'PRIVADA') {
      if (teamId) {
        throw new BadRequestException('Busca só sua não é de time nenhum.');
      }
      return;
    }

    const daCasa = can(usuario.role, 'chamado:busca-compartilhada');

    if (alcance === 'ORGANIZACAO') {
      if (!daCasa) {
        throw new ForbiddenException(
          'Compartilhar com a organização inteira é de quem responde pela central. ' +
            'Compartilhe com o seu time, ou peça a quem pode.',
        );
      }
      return;
    }

    if (!teamId) {
      throw new BadRequestException('Escolha com qual time a busca é compartilhada.');
    }

    const time = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId: usuario.organizationId },
      select: { id: true, name: true, members: { where: { userId: usuario.userId } } },
    });

    if (!time) throw new BadRequestException('Time não encontrado nesta organização.');

    if (daCasa) return;

    if (!time.members.some((m) => m.isManager)) {
      throw new ForbiddenException(
        `Compartilhar uma busca com "${time.name}" é de quem gerencia o time.`,
      );
    }
  }

  private static async marcarPadrao(
    tx: Prisma.TransactionClient,
    usuario: UsuarioAutenticado,
    savedSearchId: string,
  ): Promise<void> {
    // `upsert` na chave `(organização, pessoa)`: a chave primária **é** a
    // regra "uma padrão por pessoa", então não há o que limpar antes.
    await tx.savedSearchDefault.upsert({
      where: {
        organizationId_userId: {
          organizationId: usuario.organizationId,
          userId: usuario.userId,
        },
      },
      create: { organizationId: usuario.organizationId, userId: usuario.userId, savedSearchId },
      update: { savedSearchId },
    });
  }

  /** Tira a marca, e só se for esta busca: desmarcar não é trocar. */
  private static async limparPadrao(
    tx: Prisma.TransactionClient,
    usuario: UsuarioAutenticado,
    savedSearchId: string,
  ): Promise<void> {
    await tx.savedSearchDefault.deleteMany({
      where: { organizationId: usuario.organizationId, userId: usuario.userId, savedSearchId },
    });
  }

  /**
   * O filtro validado, pronto para o `jsonb`.
   *
   * `undefined` não existe em JSON, e o Prisma recusa objeto que o
   * contenha. O DTO deixa todo campo opcional, então os ausentes chegam
   * aqui como `undefined` — tirá-los é o que faz `{ status: undefined }`
   * gravar `{}` em vez de falhar.
   */
  private static paraJson(filtro: FiltroSalvavel): Prisma.InputJsonValue {
    return Object.fromEntries(
      Object.entries(filtro).filter(([, v]) => v !== undefined),
    ) as Prisma.InputJsonValue;
  }

  private static paraView(
    busca: {
      id: string;
      name: string;
      query: Prisma.JsonValue;
      position: number;
      shareKind: string;
      userId: string;
      team: { id: string; name: string } | null;
      user: { id: string; name: string };
    },
    usuario: UsuarioAutenticado,
    padraoId: string | undefined,
  ): BuscaSalvaView {
    return {
      id: busca.id,
      name: busca.name,
      // O que está no banco foi validado por `FiltroSalvavelDto` ao
      // entrar. Reafirmar o tipo aqui é a fronteira do `jsonb`, que o
      // Prisma tipa como "qualquer JSON".
      filtro: (busca.query ?? {}) as FiltroSalvavel,
      position: busca.position,
      isDefault: busca.id === padraoId,
      shareKind: busca.shareKind as Compartilhamento,
      team: busca.team,
      owner: busca.user,
      isMine: busca.userId === usuario.userId,
    };
  }

  private static traduzir(erro: unknown, nome: string): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException(`Você já tem uma busca salva chamada "${nome}".`);
    }

    return erro;
  }
}
