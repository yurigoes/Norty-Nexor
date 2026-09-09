import type {
  Channel,
  IntakeAction,
  IntakeCriterion,
  IntakeRuleDefinition,
  Scale,
  TicketType,
} from '@norty-desk/shared';

/**
 * O motor de regras de entrada.
 *
 * Substitui `RuleTicket` e `RuleMailCollector` do GLPI — que são cinco
 * tabelas e uma tela de montar critério campo a campo. Aqui a regra é um
 * par (critérios, ações) declarado, e este arquivo é função pura: entra
 * contexto, sai decisão. Nada de banco, nada de efeito.
 *
 * Isso importa porque regra de classificação é a coisa que mais muda
 * depois de implantado, e a única forma de mexer nela com confiança é
 * poder testá-la sem subir nada.
 */

export type ContextoDeEntrada = {
  assunto: string;
  corpo: string;
  /** E-mail ou telefone de quem escreveu. */
  remetente: string;
  canal: Channel;
  categoriaId?: string | null;
};

export type Decisao = {
  descartar?: string;
  categoriaId?: string;
  timeId?: string;
  urgencia?: Scale;
  tipo?: TicketType;
  acordoIds?: string[];
  /** Nomes das regras que casaram, para a nota na conversa. */
  regrasAplicadas: string[];
};

export type RegraCompilada = {
  id: string;
  nome: string;
  posicao: number;
  pararAoCasar: boolean;
  definicao: IntakeRuleDefinition;
};

function valorDoCampo(contexto: ContextoDeEntrada, campo: IntakeCriterion['campo']): string {
  switch (campo) {
    case 'assunto':
      return contexto.assunto;
    case 'corpo':
      return contexto.corpo;
    case 'remetente':
      return contexto.remetente;
    case 'canal':
      return contexto.canal;
    case 'categoria':
      return contexto.categoriaId ?? '';
  }
}

/** Comparação sem acento e sem caixa: "Impressora" casa com "impressora". */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function criterioCasa(contexto: ContextoDeEntrada, criterio: IntakeCriterion): boolean {
  const valor = valorDoCampo(contexto, criterio.campo);

  switch (criterio.operador) {
    case 'igual':
      return normalizar(valor) === normalizar(criterio.valor);

    case 'contem':
      return normalizar(valor).includes(normalizar(criterio.valor));

    case 'regex':
      try {
        // `i` sempre: quem escreve regra de classificação não está
        // pensando em caixa, e uma regra que só casa em minúscula é
        // pior que nenhuma.
        return new RegExp(criterio.valor, 'i').test(valor);
      } catch {
        // Regex inválida não derruba a abertura do chamado: a regra
        // simplesmente não casa, e o erro aparece na tela de regras.
        return false;
      }
  }
}

export function regraCasa(contexto: ContextoDeEntrada, definicao: IntakeRuleDefinition): boolean {
  const criterios = definicao.criteria ?? [];

  // Regra sem critério casaria com tudo. Isso é sempre engano de quem
  // escreveu, e obedecê-la classificaria a fila inteira errado.
  if (criterios.length === 0) return false;

  return definicao.match === 'OU'
    ? criterios.some((c) => criterioCasa(contexto, c))
    : criterios.every((c) => criterioCasa(contexto, c));
}

function aplicarAcao(decisao: Decisao, acao: IntakeAction): void {
  switch (acao.tipo) {
    case 'DEFINIR_CATEGORIA':
      decisao.categoriaId = acao.categoryId;
      break;
    case 'ATRIBUIR_TIME':
      decisao.timeId = acao.teamId;
      break;
    case 'DEFINIR_URGENCIA':
      decisao.urgencia = acao.urgency;
      break;
    case 'DEFINIR_TIPO':
      decisao.tipo = acao.ticketType;
      break;
    case 'APLICAR_ACORDO':
      decisao.acordoIds = acao.agreementIds;
      break;
    case 'DESCARTAR':
      decisao.descartar = acao.motivo;
      break;
  }
}

/**
 * Avalia as regras em ordem de posição.
 *
 * A regra posterior sobrescreve a anterior no mesmo campo — é a
 * semântica que as pessoas esperam de uma lista ordenada. `pararAoCasar`
 * interrompe a avaliação, e `DESCARTAR` interrompe sempre: não faz
 * sentido classificar o que não vai virar chamado.
 */
export function avaliarRegras(
  contexto: ContextoDeEntrada,
  regras: RegraCompilada[],
): Decisao {
  const decisao: Decisao = { regrasAplicadas: [] };

  for (const regra of [...regras].sort((a, b) => a.posicao - b.posicao)) {
    if (!regraCasa(contexto, regra.definicao)) continue;

    decisao.regrasAplicadas.push(regra.nome);

    for (const acao of regra.definicao.actions ?? []) {
      aplicarAcao(decisao, acao);
    }

    if (decisao.descartar) break;
    if (regra.pararAoCasar) break;
  }

  return decisao;
}
