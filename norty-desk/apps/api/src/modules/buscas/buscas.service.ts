import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BuscaSalvaView, FiltroSalvavel } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AtualizarBuscaSalvaDto, CriarBuscaSalvaDto } from './dto';

/**
 * Quantas buscas salvas uma pessoa pode ter.
 *
 * Teto porque elas são abas: trinta já não cabem na tela, e a lista é
 * relida a cada abertura da fila. Não é limite de banco, é limite de
 * coisa que serve — quem precisa de cem filtros nomeados precisa de
 * relatório, não de aba.
 */
const MAX_POR_PESSOA = 30;

/**
 * As buscas salvas de cada pessoa.
 *
 * O que o GLPI chama de *saved search* e aqui é só isto: um nome, um
 * filtro da fila, uma ordem, e a marca de qual abre por padrão.
 *
 * **A busca salva não dá acesso a nada.** Ela é um filtro; quem decide
 * quais chamados a pessoa vê é o escopo de leitura da fila
 * (`chamado:ler:proprios` / `:time` / `:todos`), aplicado depois. Uma
 * busca copiada de alguém com mais alcance mostra menos linhas para quem
 * tem menos — e não as linhas do outro.
 */
@Injectable()
export class BuscasSalvasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(usuario: UsuarioAutenticado): Promise<BuscaSalvaView[]> {
    const buscas = await this.prisma.savedSearch.findMany({
      where: { organizationId: usuario.organizationId, userId: usuario.userId },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return buscas.map((b) => BuscasSalvasService.paraView(b));
  }

  async criar(usuario: UsuarioAutenticado, dto: CriarBuscaSalvaDto): Promise<BuscaSalvaView[]> {
    const quantas = await this.prisma.savedSearch.count({
      where: { organizationId: usuario.organizationId, userId: usuario.userId },
    });

    if (quantas >= MAX_POR_PESSOA) {
      throw new BadRequestException(
        `Você já tem ${MAX_POR_PESSOA} buscas salvas, que é o limite. ` +
          'Apague uma que não usa mais para salvar esta.',
      );
    }

    // A nova entra no fim. Quem quiser outra ordem arrasta depois — e
    // colocá-la no começo empurraria a aba em que a pessoa estava.
    const ultima = await this.prisma.savedSearch.aggregate({
      where: { organizationId: usuario.organizationId, userId: usuario.userId },
      _max: { position: true },
    });

    const nome = dto.name.trim().replace(/\s+/g, ' ');

    try {
      await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) await BuscasSalvasService.limparPadrao(tx, usuario);

        await tx.savedSearch.create({
          data: {
            organizationId: usuario.organizationId,
            userId: usuario.userId,
            name: nome,
            query: BuscasSalvasService.paraJson(dto.filtro),
            position: (ultima._max.position ?? -1) + 1,
            isDefault: dto.isDefault ?? false,
          },
        });
      });
    } catch (erro) {
      throw BuscasSalvasService.traduzir(erro, nome);
    }

    return this.listar(usuario);
  }

  async atualizar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: AtualizarBuscaSalvaDto,
  ): Promise<BuscaSalvaView[]> {
    await this.minha(usuario, id);

    const nome = dto.name?.trim().replace(/\s+/g, ' ');

    try {
      await this.prisma.$transaction(async (tx) => {
        // Limpar o padrão antes de marcar o novo, na mesma transação: é
        // esta serialização que faz valer "uma padrão por pessoa", que o
        // banco não garante (ver o schema).
        if (dto.isDefault === true) await BuscasSalvasService.limparPadrao(tx, usuario);

        await tx.savedSearch.update({
          where: { id },
          data: {
            ...(nome === undefined ? {} : { name: nome }),
            ...(dto.filtro === undefined
              ? {}
              : { query: BuscasSalvasService.paraJson(dto.filtro) }),
            ...(dto.isDefault === undefined ? {} : { isDefault: dto.isDefault }),
          },
        });
      });
    } catch (erro) {
      throw BuscasSalvasService.traduzir(erro, nome ?? '');
    }

    return this.listar(usuario);
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<BuscaSalvaView[]> {
    await this.minha(usuario, id);

    await this.prisma.savedSearch.delete({ where: { id } });

    return this.listar(usuario);
  }

  /**
   * A nova ordem, pela lista inteira.
   *
   * Exige que a lista seja exatamente as buscas da pessoa: id de fora
   * seria escrever posição em busca de outro, e lista incompleta deixaria
   * as que faltam com a posição antiga, embaralhadas com as novas.
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
          'Releia a lista e mande de novo.',
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

  /**
   * A busca é desta pessoa, nesta organização.
   *
   * `organizationId` **e** `userId` no `where`, não só o id: a mesma
   * pessoa pode ter vínculo em duas organizações, e a busca salva de uma
   * não é da outra. Sem o par, um id vazado abriria a busca de outra
   * pessoa para renomear.
   */
  private async minha(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const existe = await this.prisma.savedSearch.count({
      where: { id, organizationId: usuario.organizationId, userId: usuario.userId },
    });

    if (!existe) throw new NotFoundException('Busca salva não encontrada.');
  }

  private static async limparPadrao(
    tx: Prisma.TransactionClient,
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    await tx.savedSearch.updateMany({
      where: { organizationId: usuario.organizationId, userId: usuario.userId, isDefault: true },
      data: { isDefault: false },
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

  private static paraView(busca: {
    id: string;
    name: string;
    query: Prisma.JsonValue;
    position: number;
    isDefault: boolean;
  }): BuscaSalvaView {
    return {
      id: busca.id,
      name: busca.name,
      // O que está no banco foi validado por `FiltroSalvavelDto` ao
      // entrar. Reafirmar o tipo aqui é a fronteira do `jsonb`, que o
      // Prisma tipa como "qualquer JSON".
      filtro: (busca.query ?? {}) as FiltroSalvavel,
      position: busca.position,
      isDefault: busca.isDefault,
    };
  }

  private static traduzir(erro: unknown, nome: string): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return new ConflictException(`Você já tem uma busca salva chamada "${nome}".`);
    }

    return erro;
  }
}
