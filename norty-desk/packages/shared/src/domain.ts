/**
 * Domínio do Norty Desk.
 *
 * Fonte única de verdade dos tipos compartilhados entre `apps/web` e
 * `apps/api`. Se um campo muda, ele muda aqui — e o TypeScript aponta os
 * dois lados afetados. Nunca duplique um tipo destes dentro de `apps/`.
 */

// ---------------------------------------------------------------------
// Enumerações — espelham o schema Prisma
// ---------------------------------------------------------------------

/** Incidente é "quebrou"; requisição é "preciso de". Separação do ITIL. */
export const TICKET_TYPES = ['INCIDENTE', 'REQUISICAO'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

/**
 * Espelha as constantes de `CommonITILObject` do GLPI, com nome em vez
 * de número. `INCOMING = 1` virou `NOVO`.
 */
export const TICKET_STATUSES = [
  'NOVO',
  'ATRIBUIDO',
  'PLANEJADO',
  'PENDENTE',
  'EM_APROVACAO',
  'SOLUCIONADO',
  'FECHADO',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Status em que o chamado ainda consome SLA. */
export const OPEN_STATUSES: readonly TicketStatus[] = [
  'NOVO',
  'ATRIBUIDO',
  'PLANEJADO',
  'PENDENTE',
  'EM_APROVACAO',
];

export const CHANNELS = ['WEB', 'EMAIL', 'WHATSAPP', 'API', 'SISTEMA'] as const;
export type Channel = (typeof CHANNELS)[number];

export const ACTOR_ROLES = ['REQUERENTE', 'OBSERVADOR', 'ATRIBUIDO'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export const EVENT_TYPES = [
  'MENSAGEM',
  'NOTA_INTERNA',
  'TAREFA',
  'SOLUCAO',
  'APROVACAO',
  'ANEXO',
  'MUDANCA_STATUS',
  /**
   * Mudança de status do **problema**.
   *
   * Tipo próprio porque o payload carrega `ProblemStatus`, e não
   * `TicketStatus`. Alargar `MUDANCA_STATUS` para aceitar os dois faria
   * toda leitura de status de chamado passar a conviver com valores que
   * um chamado nunca tem.
   */
  'MUDANCA_STATUS_PROBLEMA',
  'MUDANCA_STATUS_MUDANCA',
  'MUDANCA_ATRIBUICAO',
  'MUDANCA_CLASSIFICACAO',
  'PAUSA_SLA',
  'RETOMADA_SLA',
  'ENTRADA_CANAL',
  'SAIDA_CANAL',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const VISIBILITIES = ['PUBLICA', 'INTERNA'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const AGREEMENT_KINDS = ['SLA', 'OLA'] as const;
export type AgreementKind = (typeof AGREEMENT_KINDS)[number];

/** TTO = tempo até o primeiro atendimento. TTR = tempo até resolver. */
export const TARGET_KINDS = ['TTO', 'TTR'] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export const APPROVAL_STATUSES = ['AGUARDANDO', 'APROVADO', 'RECUSADO'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const LINK_TYPES = ['RELACIONADO', 'DUPLICADO_DE', 'BLOQUEIA'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

/**
 * Ciclo do problema.
 *
 * O GLPI reaproveita os status do chamado no problema, e o resultado é
 * um problema "atribuído" que ninguém sabe se já tem causa. Aqui o
 * status conta a investigação: onde ela está, e o que já dá para
 * entregar a quem atende.
 *
 * `CONTORNO_PUBLICADO` é o estado que o GLPI não tem e que mais vale no
 * dia a dia: a causa pode continuar de pé por semanas, mas o
 * atendimento já sabe o que fazer no décimo chamado igual.
 */
export const PROBLEM_STATUSES = [
  'NOVO',
  'INVESTIGANDO',
  'CAUSA_IDENTIFICADA',
  'CONTORNO_PUBLICADO',
  'RESOLVIDO',
  'FECHADO',
] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

/** Status em que o problema ainda está de pé. */
export const OPEN_PROBLEM_STATUSES: readonly ProblemStatus[] = [
  'NOVO',
  'INVESTIGANDO',
  'CAUSA_IDENTIFICADA',
  'CONTORNO_PUBLICADO',
];

/**
 * Ciclo da mudança.
 *
 * `REVERTIDA` é um estado, não uma anotação: uma mudança desfeita e uma
 * mudança que nunca saiu do papel não são a mesma coisa, e o indicador
 * de taxa de recuo — o número que diz se a gestão de mudança está
 * funcionando — depende de saber a diferença.
 */
export const CHANGE_STATUSES = [
  'RASCUNHO',
  'EM_APROVACAO',
  'APROVADA',
  'AGENDADA',
  'EM_EXECUCAO',
  'CONCLUIDA',
  'REVERTIDA',
  'RECUSADA',
  'CANCELADA',
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/**
 * O tipo decide se a mudança passa por aprovação, e é o ponto do ITIL
 * que o GLPI não modela.
 *
 * - `PADRAO`: pré-aprovada. Trocar um teclado não vai a comitê.
 * - `NORMAL`: precisa de aval antes de executar.
 * - `EMERGENCIAL`: executa primeiro. O aval vem depois, e é registrado
 *   — o que se recusa a aceitar é que ele nunca venha.
 */
export const CHANGE_KINDS = ['PADRAO', 'NORMAL', 'EMERGENCIAL'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_RISKS = ['BAIXO', 'MEDIO', 'ALTO'] as const;
export type ChangeRisk = (typeof CHANGE_RISKS)[number];

/** Status em que a mudança ainda está viva. */
export const OPEN_CHANGE_STATUSES: readonly ChangeStatus[] = [
  'RASCUNHO',
  'EM_APROVACAO',
  'APROVADA',
  'AGENDADA',
  'EM_EXECUCAO',
];

/** Urgência, impacto e prioridade vão de 1 (muito baixa) a 5 (muito alta). */
export type Scale = 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------
// Prioridade derivada
// ---------------------------------------------------------------------

/**
 * Matriz 5x5 urgência x impacto. `matrix[urgencia][impacto]`, ambos
 * indexados de 1 a 5.
 */
export type PriorityMatrix = Record<Scale, Record<Scale, Scale>>;

/**
 * Matriz padrão. Equivale ao `_matrix_{urgencia}_{impacto}` do GLPI:
 * a diagonal principal é a própria escala, e os extremos puxam para o
 * lado mais crítico sem nunca saltar dois níveis.
 */
export const DEFAULT_PRIORITY_MATRIX: PriorityMatrix = {
  1: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 },
  2: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3 },
  3: { 1: 2, 2: 2, 3: 3, 4: 4, 5: 4 },
  4: { 1: 2, 2: 3, 3: 4, 4: 4, 5: 5 },
  5: { 1: 3, 2: 3, 3: 4, 4: 5, 5: 5 },
};

/**
 * Prioridade é derivada, nunca digitada (CLAUDE.md, regra 7).
 *
 * Reproduz `CommonITILObject::computePriority()`: consulta a matriz e,
 * se a célula não existir, cai na média arredondada — o mesmo fallback
 * do GLPI.
 */
export function computePriority(
  urgency: Scale,
  impact: Scale,
  matrix: PriorityMatrix = DEFAULT_PRIORITY_MATRIX,
): Scale {
  const fromMatrix = matrix[urgency]?.[impact];
  if (fromMatrix) return fromMatrix;
  return Math.round((urgency + impact) / 2) as Scale;
}

// ---------------------------------------------------------------------
// Payload de evento — a união discriminada guardada em TicketEvent.payload
// ---------------------------------------------------------------------

export type TaskPayload = {
  type: 'TAREFA';
  assigneeId?: string;
  /** Tempo apontado, em segundos. Nunca em horas fracionadas. */
  spentSeconds: number;
  plannedStart?: string;
  plannedEnd?: string;
  done: boolean;
};

export type SolutionPayload = {
  type: 'SOLUCAO';
  solutionTypeId?: string;
  accepted: boolean;
};

export type StatusChangePayload = {
  type: 'MUDANCA_STATUS';
  from: TicketStatus;
  to: TicketStatus;
};

export type ProblemStatusChangePayload = {
  type: 'MUDANCA_STATUS_PROBLEMA';
  from: ProblemStatus;
  to: ProblemStatus;
};

/*
 * O nome dobra a palavra porque a regra de nomeação é
 * `MUDANCA_STATUS_<ENTIDADE>`, e a entidade aqui se chama Mudança.
 * Trocar a regra por um nome mais bonito custaria a previsibilidade dos
 * outros dois.
 */
export type ChangeStatusChangePayload = {
  type: 'MUDANCA_STATUS_MUDANCA';
  from: ChangeStatus;
  to: ChangeStatus;
};

export type AssignmentChangePayload = {
  type: 'MUDANCA_ATRIBUICAO';
  fromTeamId?: string;
  toTeamId?: string;
  fromUserId?: string;
  toUserId?: string;
};

export type ClassificationChangePayload = {
  type: 'MUDANCA_CLASSIFICACAO';
  fromCategoryId?: string;
  toCategoryId?: string;
  fromUrgency?: Scale;
  toUrgency?: Scale;
  fromImpact?: Scale;
  toImpact?: Scale;
};

export type ApprovalPayload = {
  type: 'APROVACAO';
  approvalId: string;
  decision: ApprovalStatus;
};

export type SlaPausePayload = {
  type: 'PAUSA_SLA';
  pendingReasonId: string;
};

export type SlaResumePayload = {
  type: 'RETOMADA_SLA';
  /** Segundos de expediente descontados dos compromissos. */
  pausedSeconds: number;
};

export type ChannelIoPayload = {
  type: 'ENTRADA_CANAL' | 'SAIDA_CANAL';
  channel: Channel;
  externalId?: string;
  /** Endereço de e-mail ou telefone em E.164. */
  address?: string;
};

export type EventPayload =
  | TaskPayload
  | SolutionPayload
  | StatusChangePayload
  | ProblemStatusChangePayload
  | ChangeStatusChangePayload
  | AssignmentChangePayload
  | ClassificationChangePayload
  | ApprovalPayload
  | SlaPausePayload
  | SlaResumePayload
  | ChannelIoPayload;

/** Anexo já gravado no armazenamento, aguardando virar `Attachment`. */
export type AnexoRecebido = {
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
};

// ---------------------------------------------------------------------
// Formulário dinâmico — substitui as 12 tabelas de tickettemplate*
// ---------------------------------------------------------------------

/**
 * Não há `ARQUIVO`.
 *
 * Anexo já é uma coisa inteira neste produto: armazenamento abstraído,
 * checksum, permissão de baixar e de remover. Um "campo de arquivo"
 * dentro do JSON de respostas seria um segundo caminho de anexo, pior
 * que o primeiro — e a tela de abertura já tem o de verdade.
 */
export const FORM_FIELD_TYPES = [
  'TEXTO',
  'TEXTO_LONGO',
  'NUMERO',
  'DATA',
  'SELECAO',
  'MULTISELECAO',
  'BOOLEANO',
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const ROTULO_CAMPO: Record<FormFieldType, string> = {
  TEXTO: 'Texto',
  TEXTO_LONGO: 'Texto longo',
  NUMERO: 'Número',
  DATA: 'Data',
  SELECAO: 'Escolha uma',
  MULTISELECAO: 'Escolha várias',
  BOOLEANO: 'Sim ou não',
};

export type FormField = {
  /** Chave da resposta em `Ticket.customFields`. `a-z`, dígitos e `_`. */
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  /** Só para SELECAO e MULTISELECAO. */
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
  help?: string;
  /** Campo visível só para agentes, nunca no portal. */
  internal?: boolean;
};

export type FormSchema = {
  fields: FormField[];
};

/** Um problema num campo, com o nome do campo em que ele está. */
export type ErroDeCampo = { key: string; mensagem: string };

const CHAVE_VALIDA = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * O formulário está bem formado?
 *
 * Roda ao salvar o formulário, e é o que impede o defeito que só
 * apareceria meses depois: duas chaves iguais gravam uma por cima da
 * outra em `customFields`, e uma seleção sem opções é um campo
 * obrigatório que ninguém consegue preencher.
 */
export function validarSchema(schema: FormSchema): ErroDeCampo[] {
  const erros: ErroDeCampo[] = [];
  const vistas = new Set<string>();

  for (const campo of schema.fields) {
    if (!CHAVE_VALIDA.test(campo.key)) {
      erros.push({
        key: campo.key,
        mensagem: 'A chave começa por letra e usa só letras minúsculas, dígitos e "_".',
      });
    }

    if (vistas.has(campo.key)) {
      erros.push({ key: campo.key, mensagem: 'Chave repetida: a resposta de uma apagaria a da outra.' });
    }
    vistas.add(campo.key);

    if (!campo.label.trim()) {
      erros.push({ key: campo.key, mensagem: 'Todo campo precisa de rótulo.' });
    }

    const ehEscolha = campo.type === 'SELECAO' || campo.type === 'MULTISELECAO';

    if (ehEscolha && !campo.options?.length) {
      erros.push({ key: campo.key, mensagem: 'Campo de escolha precisa de ao menos uma opção.' });
    }

    if (ehEscolha) {
      const valores = new Set<string>();
      for (const opcao of campo.options ?? []) {
        if (valores.has(opcao.value)) {
          erros.push({ key: campo.key, mensagem: `Opção repetida: "${opcao.value}".` });
        }
        valores.add(opcao.value);
      }
    }
  }

  return erros;
}

function vazio(valor: unknown): boolean {
  return (
    valor === undefined ||
    valor === null ||
    (typeof valor === 'string' && valor.trim() === '') ||
    (Array.isArray(valor) && valor.length === 0)
  );
}

/**
 * As respostas cabem no formulário?
 *
 * Mesma função no aplicativo e na API. A tela usa para dizer o que
 * falta antes de enviar; a API usa porque é ela quem responde por isso
 * — esconder o botão é conveniência, o guard é a proteção (CLAUDE.md,
 * regra 2), e aqui vale igual.
 *
 * Chave desconhecida é erro, não algo a ignorar em silêncio: é a mesma
 * decisão do `forbidNonWhitelisted` do corpo da requisição. Campo que
 * some do formulário depois de respondido é o caso em que isso aparece,
 * e o silêncio ali esconderia a resposta para sempre.
 */
export function validarRespostas(
  schema: FormSchema,
  respostas: Record<string, unknown>,
): ErroDeCampo[] {
  const erros: ErroDeCampo[] = [];
  const porChave = new Map(schema.fields.map((c) => [c.key, c]));

  for (const chave of Object.keys(respostas)) {
    if (!porChave.has(chave)) {
      erros.push({ key: chave, mensagem: 'Campo desconhecido neste formulário.' });
    }
  }

  for (const campo of schema.fields) {
    const valor = respostas[campo.key];

    if (vazio(valor)) {
      if (campo.required) erros.push({ key: campo.key, mensagem: `"${campo.label}" é obrigatório.` });
      continue;
    }

    const erro = erroDeTipo(campo, valor);
    if (erro) erros.push({ key: campo.key, mensagem: erro });
  }

  return erros;
}

function erroDeTipo(campo: FormField, valor: unknown): string | null {
  const opcoes = new Set((campo.options ?? []).map((o) => o.value));

  switch (campo.type) {
    case 'TEXTO':
    case 'TEXTO_LONGO':
      return typeof valor === 'string' ? null : `"${campo.label}" espera texto.`;

    case 'NUMERO':
      return typeof valor === 'number' && Number.isFinite(valor)
        ? null
        : `"${campo.label}" espera um número.`;

    case 'BOOLEANO':
      return typeof valor === 'boolean' ? null : `"${campo.label}" espera sim ou não.`;

    case 'DATA':
      return typeof valor === 'string' && !Number.isNaN(Date.parse(valor))
        ? null
        : `"${campo.label}" espera uma data.`;

    case 'SELECAO':
      return typeof valor === 'string' && opcoes.has(valor)
        ? null
        : `"${valor as string}" não é uma opção de "${campo.label}".`;

    case 'MULTISELECAO': {
      if (!Array.isArray(valor)) return `"${campo.label}" espera uma lista de opções.`;
      const fora = valor.filter((v) => typeof v !== 'string' || !opcoes.has(v));
      return fora.length === 0
        ? null
        : `${fora.map((v) => `"${String(v)}"`).join(', ')} não ${
            fora.length === 1 ? 'é opção' : 'são opções'
          } de "${campo.label}".`;
    }
  }
}

// ---------------------------------------------------------------------
// Modelos de texto — substitui followup/solution/tasktemplates
// ---------------------------------------------------------------------

/**
 * Um modelo é de resposta, de solução ou de tarefa.
 *
 * O GLPI tem **três tabelas** quase idênticas
 * (`glpi_itilfollowuptemplates`, `glpi_solutiontemplates`,
 * `glpi_tasktemplates`), cada uma com sua tela e seu CRUD. São a mesma
 * coisa — um texto pronto — usadas em três lugares. Aqui é um modelo
 * com discriminador: uma tela, uma busca, e o tipo diz onde ele aparece.
 */
export const TEMPLATE_KINDS = ['RESPOSTA', 'SOLUCAO', 'TAREFA'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const ROTULO_MODELO: Record<TemplateKind, string> = {
  RESPOSTA: 'Resposta',
  SOLUCAO: 'Solução',
  TAREFA: 'Tarefa',
};

/**
 * O que um modelo pode interpolar.
 *
 * Lista fechada de propósito. Um motor de expressões dentro do texto
 * seria mais uma linguagem para manter, e o que o atendimento precisa é
 * o nome de quem pediu e o número do chamado.
 */
export const CAMPOS_DO_MODELO = [
  'chamado.numero',
  'chamado.assunto',
  'chamado.categoria',
  'requerente.nome',
  'requerente.email',
  'agente.nome',
  'organizacao.nome',
] as const;

export type CampoDoModelo = (typeof CAMPOS_DO_MODELO)[number];

export type ContextoDoModelo = Partial<Record<CampoDoModelo, string>>;

const MARCADOR = /\{\{\s*([a-z]+\.[a-z]+)\s*\}\}/g;

/**
 * Preenche o modelo.
 *
 * Marcador desconhecido fica **como está**, visível no texto: some-lo
 * faria a frase perder um pedaço sem ninguém reparar, e é justamente
 * o que acontece quando alguém renomeia um campo. `marcadoresInvalidos`
 * existe para a tela de configuração recusar antes — errar na hora de
 * salvar é barato, errar na resposta ao cliente não é.
 */
export function preencherModelo(texto: string, contexto: ContextoDoModelo): string {
  return texto.replace(MARCADOR, (inteiro, campo: string) => {
    const valor = contexto[campo as CampoDoModelo];
    return valor === undefined ? inteiro : valor;
  });
}

/** Os marcadores do texto que não existem. */
export function marcadoresInvalidos(texto: string): string[] {
  const conhecidos = new Set<string>(CAMPOS_DO_MODELO);
  const achados = [...texto.matchAll(MARCADOR)].map((m) => m[1]!);
  return [...new Set(achados.filter((c) => !conhecidos.has(c)))];
}

// ---------------------------------------------------------------------
// Recorrência — substitui glpi_ticketrecurrents
// ---------------------------------------------------------------------

/**
 * Quando um chamado recorrente nasce.
 *
 * O GLPI guarda periodicidade em **segundos** (mais `MONTH` e `YEAR`
 * como casos especiais). Segundos não conseguem dizer "toda segunda e
 * quinta" nem "todo dia 1º": um intervalo de 604800s a partir de uma
 * data derrapa para outro dia da semana assim que alguém edita a
 * agenda, e ninguém entende por quê.
 *
 * Aqui a recorrência descreve o **calendário**, não o intervalo. É um
 * descritor pequeno de propósito: cron resolveria tudo e seria
 * impossível de configurar sem errar — e errar aqui significa abrir
 * chamado de manutenção no dia errado, todo mês, até alguém reparar.
 */
export type Recorrencia =
  | { tipo: 'DIARIA'; hora: number; minuto: number }
  | {
      tipo: 'SEMANAL';
      /** 0 = domingo .. 6 = sábado. Pelo menos um. */
      diasDaSemana: number[];
      hora: number;
      minuto: number;
    }
  | {
      tipo: 'MENSAL';
      /**
       * 1..31. Mês que não tem o dia usa o último: "todo dia 31" quer
       * dizer "no fim do mês", e pular fevereiro seria pior que
       * antecipar um dia.
       */
      diaDoMes: number;
      hora: number;
      minuto: number;
    }
  | {
      tipo: 'ANUAL';
      /** 1 = janeiro .. 12 = dezembro. */
      mes: number;
      diaDoMes: number;
      hora: number;
      minuto: number;
    };

export type TipoDeRecorrencia = Recorrencia['tipo'];

export const TIPOS_DE_RECORRENCIA = ['DIARIA', 'SEMANAL', 'MENSAL', 'ANUAL'] as const;

const DIAS_DA_SEMANA = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const;

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

function horaCurta(hora: number, minuto: number): string {
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/**
 * A recorrência em português.
 *
 * Mora aqui porque a API também descreve: o registro na linha do tempo
 * do chamado diz de qual agenda ele nasceu, e a tela mostra a mesma
 * frase. Duas versões do mesmo texto divergem na primeira correção.
 */
export function descreverRecorrencia(r: Recorrencia): string {
  const as = `às ${horaCurta(r.hora, r.minuto)}`;

  switch (r.tipo) {
    case 'DIARIA':
      return `Todo dia ${as}`;
    case 'SEMANAL': {
      const dias = [...r.diasDaSemana].sort().map((d) => DIAS_DA_SEMANA[d] ?? '?');
      if (dias.length === 0) return `Nunca — nenhum dia da semana escolhido`;
      const lista =
        dias.length === 1 ? dias[0] : `${dias.slice(0, -1).join(', ')} e ${dias.at(-1)}`;
      return `Toda ${lista} ${as}`;
    }
    case 'MENSAL':
      return `Todo dia ${r.diaDoMes} de cada mês ${as}`;
    case 'ANUAL':
      return `Todo ${r.diaDoMes} de ${MESES[r.mes - 1] ?? '?'} ${as}`;
  }
}

/**
 * A recorrência é possível?
 *
 * Uma semanal sem nenhum dia marcado nunca dispara, e uma agenda que
 * nunca dispara é pior que nenhuma: ela aparece ativa na lista.
 */
export function recorrenciaValida(r: Recorrencia): boolean {
  if (r.hora < 0 || r.hora > 23 || r.minuto < 0 || r.minuto > 59) return false;
  if (r.tipo === 'SEMANAL') {
    return r.diasDaSemana.length > 0 && r.diasDaSemana.every((d) => d >= 0 && d <= 6);
  }
  if (r.tipo === 'MENSAL') return r.diaDoMes >= 1 && r.diaDoMes <= 31;
  if (r.tipo === 'ANUAL') {
    return r.mes >= 1 && r.mes <= 12 && r.diaDoMes >= 1 && r.diaDoMes <= 31;
  }
  return true;
}

// ---------------------------------------------------------------------
// Regras de entrada — substitui RuleTicket / RuleMailCollector
// ---------------------------------------------------------------------

export type IntakeCriterion =
  | { campo: 'assunto' | 'corpo' | 'remetente'; operador: 'contem' | 'igual' | 'regex'; valor: string }
  | { campo: 'canal'; operador: 'igual'; valor: Channel }
  | { campo: 'categoria'; operador: 'igual'; valor: string };

export type IntakeAction =
  | { tipo: 'DEFINIR_CATEGORIA'; categoryId: string }
  | { tipo: 'ATRIBUIR_TIME'; teamId: string }
  | { tipo: 'DEFINIR_URGENCIA'; urgency: Scale }
  | { tipo: 'DEFINIR_TIPO'; ticketType: TicketType }
  | { tipo: 'APLICAR_ACORDO'; agreementIds: string[] }
  | { tipo: 'DESCARTAR'; motivo: string };

export type IntakeRuleDefinition = {
  criteria: IntakeCriterion[];
  /** `E` exige todos os critérios; `OU`, ao menos um. */
  match: 'E' | 'OU';
  actions: IntakeAction[];
};

// ---------------------------------------------------------------------
// Escalonamento
// ---------------------------------------------------------------------

export type EscalationAction =
  | { tipo: 'NOTIFICAR'; alvo: 'ATRIBUIDO' | 'TIME' | 'SUPERVISOR' | 'REQUERENTE' }
  | { tipo: 'AUMENTAR_URGENCIA'; para: Scale }
  | { tipo: 'ATRIBUIR_TIME'; teamId: string }
  | { tipo: 'MARCAR'; etiqueta: string }
  | { tipo: 'WEBHOOK'; webhookId: string };

// ---------------------------------------------------------------------
// Calendário
// ---------------------------------------------------------------------

export type CalendarSegmentInput = {
  /** 0 = domingo .. 6 = sábado */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Minutos desde a meia-noite, no fuso do calendário. */
  startMinute: number;
  endMinute: number;
};

/** Segunda a sexta, 9h às 18h. Padrão de implantação. */
export const DEFAULT_BUSINESS_HOURS: CalendarSegmentInput[] = [1, 2, 3, 4, 5].map(
  (weekday) => ({ weekday: weekday as 1 | 2 | 3 | 4 | 5, startMinute: 9 * 60, endMinute: 18 * 60 }),
);

// ---------------------------------------------------------------------
// Rótulos em português
// ---------------------------------------------------------------------

/**
 * O nome que a pessoa lê para cada valor do domínio.
 *
 * Mora aqui, e não no aplicativo, porque a API também rotula: o painel
 * devolve `rotulo` junto do número, e o CSV do relatório sai com o nome
 * da coluna. Duas tabelas de rótulos divergem na primeira vez que
 * alguém renomeia um status só de um lado (CLAUDE.md, regra 1).
 */
export const ROTULO_STATUS: Record<TicketStatus, string> = {
  NOVO: 'Novo',
  ATRIBUIDO: 'Atribuído',
  PLANEJADO: 'Planejado',
  PENDENTE: 'Pendente',
  EM_APROVACAO: 'Em aprovação',
  SOLUCIONADO: 'Solucionado',
  FECHADO: 'Fechado',
};

export const ROTULO_PROBLEMA_STATUS: Record<ProblemStatus, string> = {
  NOVO: 'Novo',
  INVESTIGANDO: 'Investigando',
  CAUSA_IDENTIFICADA: 'Causa identificada',
  CONTORNO_PUBLICADO: 'Contorno publicado',
  RESOLVIDO: 'Resolvido',
  FECHADO: 'Fechado',
};

export const ROTULO_MUDANCA_STATUS: Record<ChangeStatus, string> = {
  RASCUNHO: 'Rascunho',
  EM_APROVACAO: 'Em aprovação',
  APROVADA: 'Aprovada',
  AGENDADA: 'Agendada',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDA: 'Concluída',
  REVERTIDA: 'Revertida',
  RECUSADA: 'Recusada',
  CANCELADA: 'Cancelada',
};

export const ROTULO_MUDANCA_TIPO: Record<ChangeKind, string> = {
  PADRAO: 'Padrão',
  NORMAL: 'Normal',
  EMERGENCIAL: 'Emergencial',
};

export const ROTULO_MUDANCA_RISCO: Record<ChangeRisk, string> = {
  BAIXO: 'Baixo',
  MEDIO: 'Médio',
  ALTO: 'Alto',
};

export const ROTULO_CANAL: Record<Channel, string> = {
  WEB: 'Portal',
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
  API: 'API',
  SISTEMA: 'Sistema',
};

export const ROTULO_PRIORIDADE: Record<Scale, string> = {
  1: 'Muito baixa',
  2: 'Baixa',
  3: 'Média',
  4: 'Alta',
  5: 'Muito alta',
};

export const ROTULO_TIPO: Record<TicketType, string> = {
  INCIDENTE: 'Incidente',
  REQUISICAO: 'Requisição',
};

// ---------------------------------------------------------------------
// Transições de status
// ---------------------------------------------------------------------

/**
 * Para onde um chamado pode ir a partir de cada status.
 *
 * O GLPI permite quase tudo e deixa a coerência para o operador. Aqui a
 * transição inválida é 409, não um chamado em estado impossível.
 */
export const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NOVO: ['ATRIBUIDO', 'PLANEJADO', 'PENDENTE', 'EM_APROVACAO', 'SOLUCIONADO', 'FECHADO'],
  ATRIBUIDO: ['PLANEJADO', 'PENDENTE', 'EM_APROVACAO', 'SOLUCIONADO', 'FECHADO'],
  PLANEJADO: ['ATRIBUIDO', 'PENDENTE', 'EM_APROVACAO', 'SOLUCIONADO', 'FECHADO'],
  PENDENTE: ['ATRIBUIDO', 'PLANEJADO', 'SOLUCIONADO', 'FECHADO'],
  EM_APROVACAO: ['ATRIBUIDO', 'PLANEJADO', 'PENDENTE', 'SOLUCIONADO', 'FECHADO'],
  SOLUCIONADO: ['FECHADO', 'ATRIBUIDO'],
  /** Chamado fechado não recebe evento: reabrir primeiro. */
  FECHADO: ['ATRIBUIDO'],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Para onde um problema pode ir.
 *
 * Investigar volta a ser possível de qualquer estado, inclusive depois
 * de fechado: a causa que se julgava removida reaparece, e refazer o
 * registro perderia o histórico dos chamados já vinculados a ele.
 */
export const ALLOWED_PROBLEM_TRANSITIONS: Record<ProblemStatus, readonly ProblemStatus[]> = {
  NOVO: ['INVESTIGANDO', 'CAUSA_IDENTIFICADA', 'RESOLVIDO', 'FECHADO'],
  INVESTIGANDO: ['CAUSA_IDENTIFICADA', 'CONTORNO_PUBLICADO', 'RESOLVIDO', 'FECHADO'],
  CAUSA_IDENTIFICADA: ['INVESTIGANDO', 'CONTORNO_PUBLICADO', 'RESOLVIDO', 'FECHADO'],
  CONTORNO_PUBLICADO: ['INVESTIGANDO', 'CAUSA_IDENTIFICADA', 'RESOLVIDO', 'FECHADO'],
  RESOLVIDO: ['INVESTIGANDO', 'FECHADO'],
  FECHADO: ['INVESTIGANDO'],
};

export function canTransitionProblem(from: ProblemStatus, to: ProblemStatus): boolean {
  return ALLOWED_PROBLEM_TRANSITIONS[from].includes(to);
}

/**
 * Erro conhecido é causa **e** contorno documentados.
 *
 * A regra é a mesma no CHECK `problems_erro_conhecido`, no service e no
 * botão da tela. Ela mora aqui porque o aplicativo precisa dizer *por
 * que* o botão está desabilitado antes de a API recusar — e porque duas
 * cópias da mesma regra divergem na primeira vez que alguém muda uma.
 */
export function podeSerErroConhecido(problema: {
  rootCause?: string | null;
  workaround?: string | null;
}): boolean {
  return Boolean(problema.rootCause?.trim()) && Boolean(problema.workaround?.trim());
}

/** O `[P#7]` do problema, irmão do `[#1042]` do chamado. */
export function problemTag(number: number): string {
  return `[P#${number}]`;
}

/**
 * Para onde uma mudança pode ir.
 *
 * `CONCLUIDA → REVERTIDA` existe porque o recuo quase sempre acontece
 * depois de alguém declarar sucesso: é de madrugada, no dia seguinte,
 * quando o efeito aparece. Fechar a porta ali obrigaria a abrir outra
 * mudança para desfazer esta — e o histórico perderia o vínculo entre
 * as duas.
 *
 * `RECUSADA` e `CANCELADA` voltam para `RASCUNHO`: refazer o plano e
 * pedir de novo é o caminho normal, e abrir outro registro perderia a
 * discussão que levou à recusa.
 */
export const ALLOWED_CHANGE_TRANSITIONS: Record<ChangeStatus, readonly ChangeStatus[]> = {
  RASCUNHO: ['EM_APROVACAO', 'APROVADA', 'AGENDADA', 'EM_EXECUCAO', 'CANCELADA'],
  EM_APROVACAO: ['APROVADA', 'RECUSADA', 'CANCELADA'],
  APROVADA: ['AGENDADA', 'EM_EXECUCAO', 'CANCELADA'],
  AGENDADA: ['EM_EXECUCAO', 'APROVADA', 'CANCELADA'],
  EM_EXECUCAO: ['CONCLUIDA', 'REVERTIDA'],
  CONCLUIDA: ['REVERTIDA'],
  REVERTIDA: [],
  RECUSADA: ['RASCUNHO', 'CANCELADA'],
  CANCELADA: ['RASCUNHO'],
};

export function canTransitionChange(from: ChangeStatus, to: ChangeStatus): boolean {
  return ALLOWED_CHANGE_TRANSITIONS[from].includes(to);
}

/**
 * A mudança normal não executa sem aval.
 *
 * É a única regra da gestão de mudança que não se pode contornar por
 * pressa — e é justamente a que o GLPI deixa como convenção de
 * processo, sem nada no sistema que a sustente. A padrão é
 * pré-aprovada por definição; a emergencial executa primeiro e aprova
 * depois, e o registro da aprovação atrasada é o que impede
 * "emergencial" de virar o caminho de fuga de todo mundo.
 */
export function exigeAprovacaoAntesDeExecutar(kind: ChangeKind): boolean {
  return kind === 'NORMAL';
}

/**
 * Plano de recuo é o que separa mudança de aposta.
 *
 * Cobrado ao sair do rascunho, não na criação: rascunho existe
 * justamente para o plano ser escrito aos poucos.
 */
export function podeSairDoRascunho(mudanca: {
  implementationPlan?: string | null;
  rollbackPlan?: string | null;
}): boolean {
  return (
    Boolean(mudanca.implementationPlan?.trim()) && Boolean(mudanca.rollbackPlan?.trim())
  );
}

/** Agendar exige janela: "agendada para quando?" precisa de resposta. */
export function exigeJanela(status: ChangeStatus): boolean {
  return status === 'AGENDADA';
}

/** O `[M#12]` da mudança. */
export function changeTag(number: number): string {
  return `[M#${number}]`;
}

// ---------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------

/** O `[#1042]` que sustenta o threading de e-mail e as mensagens de WhatsApp. */
export function ticketTag(number: number): string {
  return `[#${number}]`;
}

export function emailSubject(number: number, subject: string): string {
  return `[Norty Desk #${number}] ${subject}`;
}

/** Extrai o número do chamado do assunto. Mesmo regex do GLPI. */
export function parseTicketNumberFromSubject(subject: string): number | null {
  const match = /\[.*#(\d+)\]/.exec(subject);
  return match ? Number(match[1]) : null;
}

/** `5511999999999@s.whatsapp.net` → `+5511999999999` */
export function normalizePhone(raw: string): string {
  const digits = raw.split('@')[0].replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}
