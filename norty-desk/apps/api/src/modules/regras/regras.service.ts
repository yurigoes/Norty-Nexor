import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { IntakeRuleDefinition } from '@norty-desk/shared';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { avaliarRegras, type ContextoDeEntrada, type Decisao, type RegraCompilada } from './motor';

@Injectable()
export class RegrasService {
  private readonly logger = new Logger(RegrasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Classifica o que está entrando.
   *
   * O motor é função pura (`motor.ts`); aqui só se carrega a lista e se
   * valida o que a decisão aponta — uma regra pode citar uma categoria
   * que alguém desativou depois, e obedecê-la abriria chamado com
   * categoria morta.
   */
  async classificar(organizationId: string, contexto: ContextoDeEntrada): Promise<Decisao> {
    try {
      return await this.avaliar(organizationId, contexto);
    } catch (erro) {
      // Classificação é conveniência; a mensagem do cliente não é.
      // Uma regra escrita errada degrada para "sem classificação" e o
      // chamado abre sem categoria — nunca faz o e-mail sumir, que foi
      // o que acontecia quando o erro subia até o processamento e
      // virava descarte em silêncio.
      this.logger.error(
        `Falha ao avaliar as regras de entrada da organização ${organizationId}: ` +
          `${(erro as Error).message}. O chamado abre sem classificação.`,
      );
      return { regrasAplicadas: [] };
    }
  }

  private async avaliar(organizationId: string, contexto: ContextoDeEntrada): Promise<Decisao> {
    const regras = await this.prisma.intakeRule.findMany({
      where: { organizationId, isActive: true },
      orderBy: { position: 'asc' },
    });

    if (regras.length === 0) return { regrasAplicadas: [] };

    const compiladas: RegraCompilada[] = regras.map((r) => ({
      id: r.id,
      nome: r.name,
      posicao: r.position,
      pararAoCasar: r.stopOnMatch,
      definicao: RegrasService.compilarDefinicao(r.criteria, r.actions),
    }));

    const decisao = avaliarRegras(contexto, compiladas);
    if (decisao.descartar) return decisao;

    return this.descartarReferenciasMortas(organizationId, decisao);
  }

  /**
   * Normaliza o que está guardado em `criteria`.
   *
   * A coluna aceita as duas formas que apareceram na prática: o objeto
   * `{ match, criteria }` que a tela manda, e a lista pura de critérios.
   * Ler a errada fazia o motor receber um objeto onde esperava lista e
   * derrubar a avaliação inteira — e, como o processamento captura
   * erro, a mensagem virava descarte em silêncio. Aceitar as duas custa
   * seis linhas.
   */
  private static compilarDefinicao(criteria: unknown, actions: unknown): IntakeRuleDefinition {
    const objeto = criteria as { match?: 'E' | 'OU'; criteria?: unknown } | null;

    const lista = Array.isArray(criteria)
      ? criteria
      : Array.isArray(objeto?.criteria)
        ? objeto.criteria
        : [];

    return {
      criteria: lista as IntakeRuleDefinition['criteria'],
      match: objeto?.match === 'OU' ? 'OU' : 'E',
      actions: (Array.isArray(actions) ? actions : []) as IntakeRuleDefinition['actions'],
    };
  }

  /** Some com o que a regra aponta e não existe mais. */
  private async descartarReferenciasMortas(
    organizationId: string,
    decisao: Decisao,
  ): Promise<Decisao> {
    if (decisao.categoriaId) {
      const existe = await this.prisma.category.count({
        where: { id: decisao.categoriaId, organizationId, isActive: true },
      });
      if (!existe) decisao.categoriaId = undefined;
    }

    if (decisao.timeId) {
      const existe = await this.prisma.team.count({
        where: { id: decisao.timeId, organizationId, isActive: true },
      });
      if (!existe) decisao.timeId = undefined;
    }

    if (decisao.acordoIds?.length) {
      const vivos = await this.prisma.agreement.findMany({
        where: { id: { in: decisao.acordoIds }, organizationId, isActive: true },
        select: { id: true },
      });
      decisao.acordoIds = vivos.map((a) => a.id);
    }

    return decisao;
  }

  // ------------------------------------------------------------------
  // Administração
  // ------------------------------------------------------------------

  async listar(usuario: UsuarioAutenticado) {
    return this.prisma.intakeRule.findMany({
      where: { organizationId: usuario.organizationId },
      orderBy: { position: 'asc' },
    });
  }

  async criar(
    usuario: UsuarioAutenticado,
    dados: { name: string; position?: number; criteria: unknown; actions: unknown; stopOnMatch?: boolean },
  ) {
    RegrasService.exigirDefinicaoUtil(dados.criteria, dados.actions);

    const ultima = await this.prisma.intakeRule.findFirst({
      where: { organizationId: usuario.organizationId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return this.prisma.intakeRule.create({
      data: {
        organizationId: usuario.organizationId,
        name: dados.name,
        position: dados.position ?? (ultima?.position ?? 0) + 10,
        criteria: dados.criteria as never,
        actions: dados.actions as never,
        stopOnMatch: dados.stopOnMatch ?? false,
      },
    });
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dados: Partial<{ name: string; position: number; criteria: unknown; actions: unknown; stopOnMatch: boolean; isActive: boolean }>,
  ) {
    const regra = await this.prisma.intakeRule.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!regra) throw new NotFoundException('Regra não encontrada.');

    if (dados.criteria || dados.actions) {
      RegrasService.exigirDefinicaoUtil(
        dados.criteria ?? regra.criteria,
        dados.actions ?? regra.actions,
      );
    }

    return this.prisma.intakeRule.update({
      where: { id },
      data: {
        name: dados.name,
        position: dados.position,
        criteria: dados.criteria as never,
        actions: dados.actions as never,
        stopOnMatch: dados.stopOnMatch,
        isActive: dados.isActive,
      },
    });
  }

  async remover(usuario: UsuarioAutenticado, id: string): Promise<void> {
    const regra = await this.prisma.intakeRule.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!regra) throw new NotFoundException('Regra não encontrada.');
    await this.prisma.intakeRule.delete({ where: { id } });
  }

  /**
   * Recusa a regra que não faria nada, ou faria demais.
   *
   * Regra sem critério casaria com todo chamado que entra; regra sem
   * ação consome avaliação e não decide nada. As duas são engano de
   * quem escreveu, e a hora de dizer isso é na hora de salvar — não
   * depois, com a fila inteira classificada errado.
   */
  private static exigirDefinicaoUtil(criteria: unknown, actions: unknown): void {
    const { criteria: lista } = RegrasService.compilarDefinicao(criteria, actions);

    if (lista.length === 0) {
      throw new BadRequestException(
        'A regra precisa de ao menos um critério. Sem critério ela casaria com todo chamado.',
      );
    }

    if (!Array.isArray(actions) || actions.length === 0) {
      throw new BadRequestException('A regra precisa de ao menos uma ação.');
    }
  }
}
