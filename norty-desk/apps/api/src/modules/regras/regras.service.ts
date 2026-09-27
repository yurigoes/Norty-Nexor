import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  IntakeRuleDefinition,
  RegraDeEntradaView,
  SimulacaoDeEntradaView,
} from '@norty-desk/shared';
import {
  CAMPOS_DE_CRITERIO,
  CAMPOS_SO_IGUAL,
  CHANNELS,
  OPERADORES_DE_CRITERIO,
  TICKET_TYPES,
  TIPOS_DE_ACAO_DE_ENTRADA,
  regexInvalida,
} from '@norty-desk/shared';
import type { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { avaliarRegras, type ContextoDeEntrada, type Decisao, type RegraCompilada } from './motor';

/** Formato do id, para a ação não guardar um destino que não é id. */
const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  /**
   * Guarda sempre `{ match, criteria }`, venha como vier.
   *
   * A tela manda a lista de critérios com o conectivo ao lado, que é a
   * forma legível; a chamada antiga mandava o objeto pronto. Gravar as
   * duas formas foi o que criou a normalização na leitura — aqui ela
   * acontece uma vez, na escrita, e a coluna volta a ter uma forma só.
   */
  private static comOConectivo(criteria: unknown, match: 'E' | 'OU' | undefined): unknown {
    const definicao = RegrasService.compilarDefinicao(criteria, []);
    return { match: match ?? definicao.match, criteria: definicao.criteria };
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

  async listar(usuario: UsuarioAutenticado): Promise<RegraDeEntradaView[]> {
    const regras = await this.prisma.intakeRule.findMany({
      where: { organizationId: usuario.organizationId },
      orderBy: { position: 'asc' },
    });

    return regras.map((r) => RegrasService.serializar(r));
  }

  /**
   * A regra na forma que a tela lê.
   *
   * A normalização acontece **aqui**, uma vez, e não em cada lugar que
   * consome: a coluna guarda duas formas de `criteria` por motivo
   * histórico, e quem lê Json cru acaba escrevendo a terceira.
   */
  private static serializar(regra: {
    id: string;
    name: string;
    position: number;
    isActive: boolean;
    stopOnMatch: boolean;
    criteria: Prisma.JsonValue;
    actions: Prisma.JsonValue;
  }): RegraDeEntradaView {
    const definicao = RegrasService.compilarDefinicao(regra.criteria, regra.actions);

    return {
      id: regra.id,
      name: regra.name,
      position: regra.position,
      isActive: regra.isActive,
      stopOnMatch: regra.stopOnMatch,
      match: definicao.match,
      criteria: definicao.criteria,
      actions: definicao.actions,
    };
  }

  /**
   * O que aconteceria com esta mensagem agora.
   *
   * Roda o mesmo caminho do processamento — as mesmas regras ativas, o
   * mesmo motor, o mesmo descarte de referência morta —, e por isso
   * mora no servidor. Simular no navegador seria uma segunda
   * implementação do motor, e a segunda é a que mente justamente quando
   * alguém precisa dela para entender por que a fila saiu errada.
   */
  async simular(
    usuario: UsuarioAutenticado,
    contexto: ContextoDeEntrada,
  ): Promise<SimulacaoDeEntradaView> {
    const decisao = await this.classificar(usuario.organizationId, contexto);

    const [categoria, time, acordos] = await Promise.all([
      decisao.categoriaId
        ? this.prisma.category.findUnique({
            where: { id: decisao.categoriaId },
            select: { id: true, name: true },
          })
        : null,
      decisao.timeId
        ? this.prisma.team.findUnique({
            where: { id: decisao.timeId },
            select: { id: true, name: true },
          })
        : null,
      decisao.acordoIds?.length
        ? this.prisma.agreement.findMany({
            where: { id: { in: decisao.acordoIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    return {
      regrasAplicadas: decisao.regrasAplicadas,
      ...(decisao.descartar ? { descartar: decisao.descartar } : {}),
      categoria,
      time,
      ...(decisao.urgencia ? { urgencia: decisao.urgencia } : {}),
      ...(decisao.tipo ? { tipo: decisao.tipo } : {}),
      acordos,
    };
  }

  async criar(
    usuario: UsuarioAutenticado,
    dados: {
      name: string;
      position?: number;
      criteria: unknown;
      match?: 'E' | 'OU';
      actions: unknown;
      stopOnMatch?: boolean;
      isActive?: boolean;
    },
  ) {
    const criteria = RegrasService.comOConectivo(dados.criteria, dados.match);
    RegrasService.exigirDefinicaoUtil(criteria, dados.actions);

    const ultima = await this.prisma.intakeRule.findFirst({
      where: { organizationId: usuario.organizationId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const criada = await this.prisma.intakeRule.create({
      data: {
        organizationId: usuario.organizationId,
        name: dados.name,
        position: dados.position ?? (ultima?.position ?? 0) + 10,
        criteria: criteria as never,
        actions: dados.actions as never,
        stopOnMatch: dados.stopOnMatch ?? false,
        isActive: dados.isActive ?? true,
      },
    });

    return RegrasService.serializar(criada);
  }

  async editar(
    usuario: UsuarioAutenticado,
    id: string,
    dados: Partial<{
      name: string;
      position: number;
      criteria: unknown;
      match: 'E' | 'OU';
      actions: unknown;
      stopOnMatch: boolean;
      isActive: boolean;
    }>,
  ) {
    const regra = await this.prisma.intakeRule.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!regra) throw new NotFoundException('Regra não encontrada.');

    // `match` sozinho também é edição de critério: trocar E por OU muda
    // o que a regra casa sem mexer em critério nenhum.
    const mexeuNaDefinicao =
      dados.criteria !== undefined || dados.actions !== undefined || dados.match !== undefined;

    const criteria = mexeuNaDefinicao
      ? RegrasService.comOConectivo(
          dados.criteria ?? regra.criteria,
          dados.match ?? RegrasService.compilarDefinicao(regra.criteria, regra.actions).match,
        )
      : undefined;

    if (mexeuNaDefinicao) {
      RegrasService.exigirDefinicaoUtil(criteria, dados.actions ?? regra.actions);
    }

    const salva = await this.prisma.intakeRule.update({
      where: { id },
      data: {
        name: dados.name,
        position: dados.position,
        criteria: criteria as never,
        actions: dados.actions as never,
        stopOnMatch: dados.stopOnMatch,
        isActive: dados.isActive,
      },
    });

    return RegrasService.serializar(salva);
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

    lista.forEach((criterio, i) => RegrasService.exigirCriterioValido(criterio, i));
    actions.forEach((acao, i) => RegrasService.exigirAcaoValida(acao, i));
  }

  /**
   * Confere o critério campo a campo.
   *
   * A tela oferece só o que é válido, mas a tela não é a proteção: o
   * `criteria` chega como `Json` e o DTO o deixa passar com `@Allow()`
   * porque a forma não cabe num decorador. Sem isto, um campo escrito
   * errado vira uma regra que nunca casa e que ninguém entende por quê
   * — o motor engole o desconhecido de propósito, para regra quebrada
   * não derrubar a abertura do chamado.
   */
  private static exigirCriterioValido(criterio: unknown, indice: number): void {
    const onde = `Critério ${indice + 1}`;
    const c = criterio as { campo?: unknown; operador?: unknown; valor?: unknown } | null;

    if (!c || typeof c !== 'object') {
      throw new BadRequestException(`${onde}: formato inválido.`);
    }

    if (!CAMPOS_DE_CRITERIO.includes(c.campo as never)) {
      throw new BadRequestException(
        `${onde}: "${String(c.campo)}" não é um campo. Use ${CAMPOS_DE_CRITERIO.join(', ')}.`,
      );
    }

    if (!OPERADORES_DE_CRITERIO.includes(c.operador as never)) {
      throw new BadRequestException(
        `${onde}: "${String(c.operador)}" não é um operador. ` +
          `Use ${OPERADORES_DE_CRITERIO.join(', ')}.`,
      );
    }

    if (typeof c.valor !== 'string' || c.valor.trim() === '') {
      throw new BadRequestException(`${onde}: falta o valor a comparar.`);
    }

    const campo = c.campo as (typeof CAMPOS_DE_CRITERIO)[number];

    // "Canal contém EMA" não quer dizer nada, e "categoria casa com a
    // expressão" compara contra um UUID.
    if (CAMPOS_SO_IGUAL.includes(campo) && c.operador !== 'igual') {
      throw new BadRequestException(`${onde}: o campo "${campo}" só aceita "igual".`);
    }

    if (campo === 'canal' && !CHANNELS.includes(c.valor as never)) {
      throw new BadRequestException(`${onde}: "${c.valor}" não é um canal.`);
    }

    // A regex quebrada não derruba nada em produção — o motor a engole
    // —, e é exatamente por isso que ela precisa ser recusada aqui: o
    // sintoma dela é uma regra que nunca casa, em silêncio.
    if (c.operador === 'regex') {
      const problema = regexInvalida(c.valor);
      if (problema) throw new BadRequestException(`${onde}: ${problema}`);
    }
  }

  private static exigirAcaoValida(acao: unknown, indice: number): void {
    const onde = `Ação ${indice + 1}`;
    const a = acao as Record<string, unknown> | null;

    if (!a || typeof a !== 'object' || !TIPOS_DE_ACAO_DE_ENTRADA.includes(a.tipo as never)) {
      throw new BadRequestException(
        `${onde}: "${String(a?.tipo)}" não é uma ação. ` +
          `Use ${TIPOS_DE_ACAO_DE_ENTRADA.join(', ')}.`,
      );
    }

    const exigirUuid = (campo: string) => {
      if (typeof a[campo] !== 'string' || !EH_UUID.test(a[campo] as string)) {
        throw new BadRequestException(`${onde}: falta escolher o destino.`);
      }
    };

    switch (a.tipo) {
      case 'DEFINIR_CATEGORIA':
        exigirUuid('categoryId');
        break;
      case 'ATRIBUIR_TIME':
        exigirUuid('teamId');
        break;
      case 'DEFINIR_URGENCIA':
        if (typeof a.urgency !== 'number' || a.urgency < 1 || a.urgency > 5) {
          throw new BadRequestException(`${onde}: a urgência vai de 1 a 5.`);
        }
        break;
      case 'DEFINIR_TIPO':
        if (!TICKET_TYPES.includes(a.ticketType as never)) {
          throw new BadRequestException(`${onde}: "${String(a.ticketType)}" não é um tipo.`);
        }
        break;
      case 'APLICAR_ACORDO':
        if (!Array.isArray(a.agreementIds) || a.agreementIds.length === 0) {
          throw new BadRequestException(`${onde}: escolha ao menos um acordo.`);
        }
        break;
      case 'DESCARTAR':
        // O motivo fica no `discardedReason` da mensagem, e é a única
        // explicação que sobra de um e-mail que não virou chamado.
        if (typeof a.motivo !== 'string' || a.motivo.trim() === '') {
          throw new BadRequestException(
            `${onde}: o descarte precisa de motivo — é o que sobra para explicar ` +
              'o e-mail que não virou chamado.',
          );
        }
        break;
    }
  }
}
