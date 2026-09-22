import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ArticleDetail,
  ArticleListItem,
  VerificacaoSugerida,
  ArticleRevisionView,
} from '@norty-desk/shared';
import { can } from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { escopoDeLeitura } from '../tickets/tickets.escopo';
import type { BuscarArtigosDto, EditarArtigoDto, EscreverArtigoDto } from './dto';

const INCLUDE = {
  author: true,
  category: true,
  sourceTicket: { select: { id: true, number: true } },
  _count: { select: { revisions: true, resolucoes: true } },
} satisfies Prisma.ArticleInclude;

type ArtigoComRelacoes = Prisma.ArticleGetPayload<{ include: typeof INCLUDE }>;

/**
 * Base de conhecimento.
 *
 * Duas coisas que o GLPI tem e quase ninguém usa, e por um motivo: o
 * artigo vive longe do chamado, e escrever um exige sair do que se está
 * fazendo. Aqui a sugestão vem para dentro do chamado — é o mesmo
 * conteúdo, encontrado na hora em que serve.
 */
@Injectable()
export class ConhecimentoService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------

  async buscar(usuario: UsuarioAutenticado, filtro: BuscarArtigosDto): Promise<ArticleListItem[]> {
    const limite = filtro.limit ?? 30;
    const termo = filtro.q?.trim();

    if (!termo) {
      const artigos = await this.prisma.article.findMany({
        where: {
          organizationId: usuario.organizationId,
          ...(filtro.arquivados ? {} : { isArchived: false }),
          ...(filtro.categoryId ? { categoryId: filtro.categoryId } : {}),
          ...this.visibilidade(usuario, filtro.public),
        },
        include: INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: limite,
      });

      return artigos.map((a) => ConhecimentoService.paraLista(a));
    }

    return this.buscarPorTexto(usuario, termo, filtro, limite);
  }

  /**
   * Busca em português, com o índice do banco.
   *
   * `plainto_tsquery` exigiria **todos** os termos: com um assunto de
   * chamado inteiro nunca casaria nada. Aqui os lexemas do texto viram
   * um `OR`, e o `ts_rank` ordena — quem casa mais termos sobe. Os
   * lexemas saem do próprio `to_tsvector` e entram citados, então não há
   * texto do usuário chegando cru ao `to_tsquery`.
   *
   * As palavras-chave ficam fora do vetor (ver a migração) e entram por
   * sobreposição de array: etiqueta é busca exata.
   */
  private async buscarPorTexto(
    usuario: UsuarioAutenticado,
    termo: string,
    filtro: BuscarArtigosDto,
    limite: number,
  ): Promise<ArticleListItem[]> {
    const etiquetas = termo
      .toLowerCase()
      .split(/[\s,;]+/)
      .filter(Boolean)
      .slice(0, 20);

    const podeInterno = can(usuario.role, 'artigo:ler:interno');
    const soPublicos = filtro.public === true || !podeInterno;

    const linhas = await this.prisma.$queryRaw<{ id: string; rank: number }[]>`
      WITH consulta AS (
        SELECT to_tsquery(
                 'portuguese',
                 nullif(string_agg(quote_literal(lexeme), ' | '), '')
               ) AS q
        FROM unnest(to_tsvector('portuguese', ${termo})) AS t(lexeme, positions, weights)
      )
      SELECT a."id",
             CASE WHEN consulta.q IS NULL THEN 0
                  ELSE ts_rank(a."busca", consulta.q) END AS rank
      FROM "articles" a, consulta
      WHERE a."organizationId" = ${usuario.organizationId}::uuid
        AND (${filtro.arquivados ?? false} OR a."isArchived" = false)
        AND (${!soPublicos} OR a."isPublic" = true)
        AND (${filtro.categoryId ?? null}::uuid IS NULL OR a."categoryId" = ${filtro.categoryId ?? null}::uuid)
        AND (
          (consulta.q IS NOT NULL AND a."busca" @@ consulta.q)
          OR a."keywords" && ${etiquetas}::text[]
        )
      ORDER BY rank DESC, a."views" DESC, a."updatedAt" DESC
      LIMIT ${limite}
    `;

    if (linhas.length === 0) return [];

    const artigos = await this.prisma.article.findMany({
      where: { id: { in: linhas.map((l) => l.id) } },
      include: INCLUDE,
    });

    // O `IN` volta em ordem do banco; a ordem que importa é a do rank.
    const porId = new Map(artigos.map((a) => [a.id, a]));

    return linhas
      .map((l) => porId.get(l.id))
      .filter((a): a is ArtigoComRelacoes => a !== undefined)
      .map((a) => ({
        ...ConhecimentoService.paraLista(a),
        excerpt: ConhecimentoService.trecho(a.body, termo),
      }));
  }

  async obter(usuario: UsuarioAutenticado, id: string): Promise<ArticleDetail> {
    const artigo = await this.prisma.article.findFirst({
      where: {
        id,
        organizationId: usuario.organizationId,
        ...this.visibilidade(usuario),
      },
      include: INCLUDE,
    });

    if (!artigo) throw new NotFoundException('Artigo não encontrado.');

    // Contar leitura é o que faz "os mais lidos" significar alguma
    // coisa. Fora da transação de propósito: perder uma contagem numa
    // corrida não é problema, e travar a linha a cada leitura é.
    await this.prisma.article
      .update({ where: { id }, data: { views: { increment: 1 } } })
      .catch(() => undefined);

    return {
      ...ConhecimentoService.paraLista(artigo),
      body: artigo.body,
      version: artigo._count.revisions,
      createdAt: artigo.createdAt.toISOString(),
    };
  }

  async revisoes(usuario: UsuarioAutenticado, id: string): Promise<ArticleRevisionView[]> {
    const artigo = await this.prisma.article.findFirst({
      where: { id, organizationId: usuario.organizationId, ...this.visibilidade(usuario) },
      select: { id: true },
    });

    if (!artigo) throw new NotFoundException('Artigo não encontrado.');

    const revisoes = await this.prisma.articleRevision.findMany({
      where: { articleId: id },
      include: { editor: true },
      orderBy: { version: 'desc' },
    });

    return revisoes.map((r) => ({
      version: r.version,
      title: r.title,
      body: r.body,
      note: r.note,
      editor: { kind: 'USER', id: r.editor.id, name: r.editor.name, email: r.editor.email },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // -------------------------------------------------------------------
  // Escrita
  // -------------------------------------------------------------------

  async criar(usuario: UsuarioAutenticado, dto: EscreverArtigoDto): Promise<ArticleDetail> {
    if (dto.isPublic) this.exigirPodePublicar(usuario, true);
    await this.exigirCategoria(usuario, dto.categoryId);

    const artigo = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.article.create({
        data: {
          organizationId: usuario.organizationId,
          authorId: usuario.userId,
          title: dto.title,
          body: dto.body,
          categoryId: dto.categoryId ?? null,
          keywords: dto.keywords ?? [],
          isPublic: dto.isPublic ?? false,
        },
      });

      // A versão 1 é o texto de origem. Sem ela o histórico começaria
      // na primeira edição e a criação não teria registro.
      await tx.articleRevision.create({
        data: {
          articleId: criado.id,
          version: 1,
          title: criado.title,
          body: criado.body,
          note: dto.note ?? 'Versão inicial.',
          editorId: usuario.userId,
        },
      });

      return criado;
    });

    return this.obter(usuario, artigo.id);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: EditarArtigoDto,
  ): Promise<ArticleDetail> {
    const atual = await this.prisma.article.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });

    if (!atual) throw new NotFoundException('Artigo não encontrado.');

    if (dto.isPublic !== undefined && dto.isPublic !== atual.isPublic) {
      this.exigirPodePublicar(usuario, dto.isPublic);
    }

    await this.exigirCategoria(usuario, dto.categoryId);

    const title = dto.title ?? atual.title;
    const body = dto.body ?? atual.body;
    const mudouTexto = title !== atual.title || body !== atual.body;

    await this.prisma.$transaction(async (tx) => {
      await tx.article.update({
        where: { id },
        data: {
          title,
          body,
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId ?? null } : {}),
          ...(dto.keywords !== undefined ? { keywords: dto.keywords } : {}),
          ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
          ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
        },
      });

      // Revisão só quando o texto muda. Trocar a categoria ou arquivar
      // não é uma versão nova do artigo, e gravá-la encheria o histórico
      // de linhas idênticas.
      if (mudouTexto) {
        const ultima = await tx.articleRevision.aggregate({
          where: { articleId: id },
          _max: { version: true },
        });

        await tx.articleRevision.create({
          data: {
            articleId: id,
            version: (ultima._max.version ?? 0) + 1,
            title,
            body,
            note: dto.note ?? null,
            editorId: usuario.userId,
          },
        });
      }
    });

    return this.obter(usuario, id);
  }

  // -------------------------------------------------------------------
  // Sugestão a partir de um chamado
  // -------------------------------------------------------------------

  /**
   * O que já foi escrito sobre isto.
   *
   * A busca é o assunto mais a descrição do chamado. É a razão de a
   * base de conhecimento existir: encontrar o artigo depois de fechar o
   * chamado não ajuda ninguém.
   */
  async sugerirPara(
    usuario: UsuarioAutenticado,
    ticketId: string,
    limite = 5,
  ): Promise<ArticleListItem[]> {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { subject: true, description: true, categoryId: true },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    const termo = `${chamado.subject} ${chamado.description}`.slice(0, 2000);
    const achados = await this.buscarPorTexto(usuario, termo, {}, limite);

    if (achados.length > 0 || !chamado.categoryId) return achados;

    // Sem casamento de texto, os artigos da categoria do chamado são o
    // melhor palpite que existe — melhor do que devolver nada.
    return this.buscar(usuario, { categoryId: chamado.categoryId, limit: limite });
  }

  /**
   * A verificação que o sistema propõe neste chamado.
   *
   * É `sugerirPara` com duas diferenças, e as duas mudam o que a tela
   * consegue dizer:
   *
   * **Ordena pelo que resolveu**, não só pelo que casa por texto. Uma
   * resolução que já fechou cinco chamados parecidos vale mais do que
   * um artigo com as mesmas palavras — texto parecido não é a mesma
   * coisa que solução que funcionou.
   *
   * **Diz o que já foi confirmado aqui**, para a tela não propor de
   * novo o que quem atende já marcou como a resposta deste chamado.
   */
  async verificacoesPara(
    usuario: UsuarioAutenticado,
    ticketId: string,
    limite = 5,
  ): Promise<VerificacaoSugerida[]> {
    const achados = await this.sugerirPara(usuario, ticketId, limite);

    const confirmadas = await this.prisma.articleResolution.findMany({
      where: { ticketId },
      select: { articleId: true },
    });
    const jaConfirmadas = new Set(confirmadas.map((c) => c.articleId));

    return achados
      .map((a) => ({ ...a, confirmada: jaConfirmadas.has(a.id) }))
      .sort(
        (a, b) =>
          // O que já foi confirmado aqui vem primeiro: é a resposta
          // deste chamado, e some da lista de "confira isto".
          Number(b.confirmada) - Number(a.confirmada) ||
          b.resolvedCount - a.resolvedCount ||
          b.views - a.views,
      );
  }

  /**
   * A resolução deste chamado, registrada no índice.
   *
   * O corpo vem pronto da solução que quem atendeu escreveu — a tela o
   * traz preenchido de propósito. Página em branco no fim do
   * atendimento é onde a base de conhecimento morre: ninguém redige
   * artigo depois de já ter resolvido o problema.
   *
   * O artigo guarda de qual chamado saiu, e já nasce confirmado como a
   * resolução dele: quem escreveu acabou de resolver com aquilo.
   */
  async registrarResolucao(
    usuario: UsuarioAutenticado,
    ticketId: string,
    dados: { title: string; body: string; isPublic?: boolean; keywords?: string[] },
  ): Promise<ArticleDetail> {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true, categoryId: true, organizationId: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    const artigo = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.article.create({
        data: {
          organizationId: usuario.organizationId,
          title: dados.title.trim(),
          body: dados.body,
          isPublic: dados.isPublic ?? false,
          // A categoria vem do chamado: é o assunto, e foi quem
          // atendeu que o classificou.
          categoryId: chamado.categoryId,
          keywords: dados.keywords ?? [],
          authorId: usuario.userId,
          sourceTicketId: chamado.id,
        },
        select: { id: true },
      });

      await tx.articleResolution.create({
        data: { articleId: criado.id, ticketId: chamado.id, confirmedById: usuario.userId },
      });

      // Relido **depois** da confirmação: o `_count` do `create` é
      // tirado antes de ela existir, e a resposta saía dizendo que a
      // resolução não resolveu nada — na própria tela de quem acabou de
      // registrá-la.
      return tx.article.findUniqueOrThrow({ where: { id: criado.id }, include: INCLUDE });
    });

    // Sem trilha de auditoria própria, como o resto deste módulo: o
    // registro é a linha do tempo do chamado (CLAUDE.md, regra 8), e a
    // revisão do artigo guarda o que mudou depois.
    return {
      ...ConhecimentoService.paraLista(artigo),
      body: artigo.body,
      version: 1,
      createdAt: artigo.createdAt.toISOString(),
    };
  }

  /**
   * "Isto resolveu." — e é este gesto que faz o índice aprender.
   *
   * Sem ele, a ordem das sugestões seria para sempre casamento de
   * texto. Com ele, o que resolve sobe, e quem atende o próximo chamado
   * parecido encontra primeiro o que costuma funcionar.
   *
   * Repetir não é erro: o `@@id` composto segura a contagem dupla no
   * banco, que é onde regra que não pode ser burlada mora (CLAUDE.md,
   * regra 4).
   */
  async confirmarResolucao(
    usuario: UsuarioAutenticado,
    ticketId: string,
    articleId: string,
  ): Promise<VerificacaoSugerida[]> {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id: ticketId }] },
      select: { id: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    const artigo = await this.prisma.article.findFirst({
      where: { id: articleId, organizationId: usuario.organizationId },
      select: { id: true, title: true },
    });
    if (!artigo) throw new NotFoundException('Resolução não encontrada.');

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.articleResolution.createMany({
        data: [{ articleId, ticketId, confirmedById: usuario.userId }],
        skipDuplicates: true,
      });

      // Só registra na linha do tempo quando é novidade: confirmar duas
      // vezes não pode virar dois eventos idênticos na conversa.
      if (count > 0) {
        await tx.ticketEvent.create({
          data: {
            ticketId,
            type: 'NOTA_INTERNA',
            visibility: 'INTERNA',
            authorId: usuario.userId,
            channel: 'WEB',
            body: `Resolvido com a resolução do índice: "${artigo.title}".`,
          },
        });
      }
    });

    return this.verificacoesPara(usuario, ticketId);
  }

  /** Desfaz a confirmação: marcar errado tem de ter volta. */
  async desconfirmarResolucao(
    usuario: UsuarioAutenticado,
    ticketId: string,
    articleId: string,
  ): Promise<VerificacaoSugerida[]> {
    await this.prisma.articleResolution.deleteMany({
      where: {
        articleId,
        ticketId,
        article: { organizationId: usuario.organizationId },
      },
    });

    return this.verificacoesPara(usuario, ticketId);
  }

  // -------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------

  /**
   * Quem não lê artigo interno só enxerga o publicado.
   *
   * Vale para o solicitante do portal: a base tem procedimento que
   * menciona senha de serviço e contrato de fornecedor.
   */
  private visibilidade(
    usuario: UsuarioAutenticado,
    apenasPublicos?: boolean,
  ): { isPublic?: boolean } {
    if (apenasPublicos === true) return { isPublic: true };
    return can(usuario.role, 'artigo:ler:interno') ? {} : { isPublic: true };
  }

  /**
   * Publicar e despublicar são a mesma decisão.
   *
   * Tirar do ar o que a organização decidiu mostrar ao cliente não é
   * menos grave do que colocar — por isso a checagem é sobre a mudança,
   * não sobre o valor.
   */
  private exigirPodePublicar(usuario: UsuarioAutenticado, publicando: boolean): void {
    if (can(usuario.role, 'artigo:publicar')) return;

    throw new ForbiddenException(
      publicando
        ? 'Escrever você pode; publicar para o portal do solicitante exige `artigo:publicar`.'
        : 'Tirar um artigo do portal exige `artigo:publicar`.',
    );
  }

  private async exigirCategoria(usuario: UsuarioAutenticado, categoryId?: string | null) {
    if (!categoryId) return;

    const categoria = await this.prisma.category.findFirst({
      where: { id: categoryId, organizationId: usuario.organizationId },
      select: { id: true },
    });

    if (!categoria) throw new NotFoundException('Categoria não encontrada.');
  }

  private static paraLista(artigo: ArtigoComRelacoes): ArticleListItem {
    return {
      id: artigo.id,
      title: artigo.title,
      isPublic: artigo.isPublic,
      isArchived: artigo.isArchived,
      category: artigo.category ? { id: artigo.category.id, name: artigo.category.name } : null,
      keywords: artigo.keywords,
      author: {
        kind: 'USER',
        id: artigo.author.id,
        name: artigo.author.name,
        email: artigo.author.email,
      },
      views: artigo.views,
      updatedAt: artigo.updatedAt.toISOString(),
      resolvedCount: artigo._count.resolucoes,
      fromTicket: artigo.sourceTicket
        ? { id: artigo.sourceTicket.id, number: artigo.sourceTicket.number }
        : null,
    };
  }

  /** Um trecho em volta do primeiro termo que aparecer. */
  private static trecho(corpo: string, termo: string): string {
    const limpo = corpo.replace(/\s+/g, ' ').trim();
    const palavras = termo
      .toLowerCase()
      .split(/[\s,;]+/)
      .filter((p) => p.length > 3);

    const minusculo = limpo.toLowerCase();
    const posicao = palavras
      .map((p) => minusculo.indexOf(p))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];

    if (posicao === undefined) return limpo.slice(0, 180);

    const inicio = Math.max(0, posicao - 60);
    return (inicio > 0 ? '…' : '') + limpo.slice(inicio, inicio + 180) + (limpo.length > inicio + 180 ? '…' : '');
  }
}
