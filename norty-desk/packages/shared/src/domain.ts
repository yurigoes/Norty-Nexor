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
  /**
   * O anexo foi retirado.
   *
   * Tipo próprio, e não a remoção do evento `ANEXO` original: se o
   * arquivo some sem deixar marca, a linha do tempo mente — passa a
   * dizer que ele nunca existiu. O chamado é registro de atendimento, e
   * o que foi juntado e depois retirado faz parte do que aconteceu.
   */
  'ANEXO_REMOVIDO',
  /** Atendimento marcado, remarcado, cancelado ou realizado. */
  'AGENDAMENTO',
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
  /**
   * Sai um equipamento, entra outro.
   *
   * Tipo próprio, e **público**: o cliente tem direito de ver que o
   * notebook dele mudou, qual entrou e para onde o antigo foi. Registrar
   * isso só como nota interna deixaria o histórico do chamado dizendo
   * que nada aconteceu, num atendimento em que a coisa mais concreta
   * que existe é a máquina que trocou de mão.
   */
  'TROCA_DE_ATIVO',
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

export const APPOINTMENT_STATUSES = ['AGENDADO', 'REALIZADO', 'CANCELADO'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type AppointmentPayload = {
  type: 'AGENDAMENTO';
  action: 'MARCADO' | 'REMARCADO' | 'CANCELADO' | 'REALIZADO';
  scheduledFor: string;
  durationMinutes: number;
  /** Quanto o prazo do chamado andou por causa disto. */
  postponedSeconds: number;
};

/**
 * A troca, como ela fica no papel do chamado.
 *
 * Os nomes são gravados aqui e não lidos do cadastro depois: renomear o
 * equipamento meses adiante não pode reescrever o que o chamado disse
 * que aconteceu. Os ids vão junto para a tela conseguir linkar.
 */
export type AssetSwapPayload = {
  type: 'TROCA_DE_ATIVO';
  saiu: { id: string; nome: string; patrimonio: string | null };
  entrou: { id: string; nome: string; patrimonio: string | null };
  /** Para onde o que saiu foi, na hora em que saiu. */
  destino: 'EM_ESTOQUE' | 'BAIXADO';
  /** Voltou quebrado, e há termo de ocorrência assinado. */
  comQuebra: boolean;
};

export type EventPayload =
  | TaskPayload
  | AppointmentPayload
  | SolutionPayload
  | StatusChangePayload
  | ProblemStatusChangePayload
  | ChangeStatusChangePayload
  | AssignmentChangePayload
  | ClassificationChangePayload
  | ApprovalPayload
  | SlaPausePayload
  | SlaResumePayload
  | AssetSwapPayload
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

/**
 * O mesmo formulário, sem o que é da casa.
 *
 * Campo `internal` é pergunta de quem atende — "custo estimado",
 * "número do contrato". Escondê-lo na tela não basta: quem abre sem
 * login recebe o schema em JSON, e o rótulo do campo interno ia junto,
 * contando ao visitante o que a empresa controla por dentro.
 *
 * `isPublic` é marca da ficha inteira e não resolve isto: o caso real
 * é o modelo que deve mesmo ser público e tem *um* campo interno.
 *
 * Serve às duas pontas: a API recorta antes de responder e antes de
 * validar — assim a resposta a um campo interno vira "chave
 * desconhecida", que é o que ela é nessa porta — e o aplicativo
 * recorta para desenhar. Esconder o campo é conveniência; recortar o
 * schema na API é a proteção (CLAUDE.md, regra 2).
 */
export function schemaSemInternos(schema: FormSchema): FormSchema {
  return { ...schema, fields: schema.fields.filter((c) => !c.internal) };
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
 * O telefone como a pessoa digita, guardado como o WhatsApp exige.
 *
 * Ninguém escreve `+5511999999999` num formulário. Escreve
 * `(11) 99999-9999`, ou `11 99999 9999`, ou cola com o zero de tronco
 * na frente. O canal, do outro lado, precisa de E.164 — e o número
 * gravado num formato e procurado noutro é contato duplicado e resposta
 * que não chega.
 *
 * Então o `+55` é trabalho do sistema, não da pessoa.
 *
 * Devolve `null` quando aquilo não dá um número brasileiro utilizável —
 * faltou o DDD, sobrou dígito. Recusar é melhor que gravar um número
 * que o WhatsApp vai rejeitar em silêncio semanas depois.
 *
 * Número estrangeiro digitado com `+` é devolvido como veio: quem
 * escreveu `+351` sabia o que estava fazendo, e forçar `+55` nele
 * seria pior que não tentar.
 */
export function telefoneBrasileiro(digitado: string | null | undefined): string | null {
  const cru = (digitado ?? '').trim();
  if (cru === '') return null;

  const internacional = cru.startsWith('+');
  const digitos = cru.replace(/\D/g, '');
  if (digitos === '') return null;

  // Veio com `+` e não é Brasil: é de outro país, e não é aqui que se
  // decide o formato de outro país.
  if (internacional && !digitos.startsWith('55')) return `+${digitos}`;

  // 13 = 55 + DDD + 9 dígitos; 12 = 55 + DDD + 8. A leitura por
  // comprimento é o que resolve o DDD 55 (Santa Maria): `55999999999`
  // tem 11 e é lido como DDD, não como país.
  if (digitos.length === 13 && digitos.startsWith('55')) return `+${digitos}`;
  if (digitos.length === 12 && digitos.startsWith('55')) return `+${digitos}`;

  // O zero de tronco é de ligação interurbana, não faz parte do número.
  const semTronco = digitos.startsWith('0') ? digitos.slice(1) : digitos;

  // 11 = DDD + celular de 9; 10 = DDD + fixo de 8.
  if (semTronco.length === 11 || semTronco.length === 10) return `+55${semTronco}`;

  return null;
}

/**
 * O nome do assistente, e a linha que declara a resposta automática.
 *
 * Mora aqui porque três pontas a escrevem: o selo na tela, o e-mail e o
 * WhatsApp. Com o texto em cada uma, bastaria mudar um e as outras
 * passariam a dizer outra coisa sobre a mesma resposta.
 */
export const NOME_DA_IA = 'Norty Copilot';

export const MARCA_DE_IA = `🤖 Resposta gerada por IA (${NOME_DA_IA}) e enviada pelo atendimento.`;

/**
 * Para quem vai o chamado.
 *
 * Duas fontes dizem o destino, e elas podem discordar. A **categoria**
 * classifica ("Hardware vai para a Infra"); o **modelo escolhido** é
 * uma afirmação mais específica ("Troca de toner vai para o Suporte"),
 * e por isso vence — inteira, não campo a campo. Se o modelo nomeia um
 * time e a categoria nomeia uma pessoa, vale o time do modelo: quem
 * montou o modelo sabia da categoria e decidiu diferente.
 *
 * Dentro de cada fonte, a pessoa vence o time: quem nomeia alguém quis
 * aquele alguém, e cair na fila do time seria ignorar a configuração.
 *
 * O modelo só entra aqui quando foi **escolhido**. Formulário que veio
 * por herança da categoria não redireciona nada — senão o formulário
 * padrão da organização, que vale onde não há outro, passaria a rotear
 * todo chamado da casa para um lugar só.
 *
 * Função pura porque é regra, e regra se testa sem banco.
 */
export type DestinoDoChamado = { assigneeId: string | null; teamId: string | null };

export function destinoDoChamado(
  doModeloEscolhido: DestinoDoChamado | null,
  daCategoria: DestinoDoChamado | null,
): DestinoDoChamado {
  const fonte = dizAlgo(doModeloEscolhido) ? doModeloEscolhido : daCategoria;
  if (!dizAlgo(fonte)) return { assigneeId: null, teamId: null };

  return fonte.assigneeId
    ? { assigneeId: fonte.assigneeId, teamId: null }
    : { assigneeId: null, teamId: fonte.teamId };
}

function dizAlgo(d: DestinoDoChamado | null): d is DestinoDoChamado {
  return d !== null && (d.assigneeId !== null || d.teamId !== null);
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
// Contrato, orçamento e custo — substitui contracts/budgets/ticketcosts
// ---------------------------------------------------------------------

export const CONTRACT_KINDS = [
  'SUPORTE',
  'LICENCA',
  'LOCACAO',
  'MANUTENCAO',
  'SERVICO',
  'OUTRO',
] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

export const ROTULO_CONTRATO: Record<ContractKind, string> = {
  SUPORTE: 'Suporte',
  LICENCA: 'Licença',
  LOCACAO: 'Locação',
  MANUTENCAO: 'Manutenção',
  SERVICO: 'Serviço',
  OUTRO: 'Outro',
};

export const BILLING_PERIODS = ['MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICO'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const ROTULO_COBRANCA: Record<BillingPeriod, string> = {
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
  UNICO: 'Pagamento único',
};

/** Quantos meses cada cobrança cobre. `UNICO` não tem período. */
const MESES_DA_COBRANCA: Record<BillingPeriod, number | null> = {
  MENSAL: 1,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
  UNICO: null,
};

/**
 * O custo mensal equivalente do contrato.
 *
 * É o número que permite somar um contrato anual com um mensal sem
 * mentir. `UNICO` devolve `null` em vez de zero: um pagamento único não
 * tem custo mensal, e fingir que tem zero faria a soma da carteira
 * parecer menor do que é.
 */
export function custoMensal(contrato: {
  billingPeriod: BillingPeriod;
  value: number;
}): number | null {
  const meses = MESES_DA_COBRANCA[contrato.billingPeriod];
  return meses === null ? null : contrato.value / meses;
}

/**
 * Quantos dias faltam para o contrato vencer.
 *
 * Negativo já venceu. `null` é prazo indeterminado — que não é o mesmo
 * que "não vence tão cedo", e a tela precisa dizer a diferença.
 */
export function diasParaVencer(endsAt: string | null, agora = new Date()): number | null {
  if (!endsAt) return null;
  const fim = new Date(endsAt).getTime();
  return Math.ceil((fim - agora.getTime()) / 86_400_000);
}

/**
 * O contrato está dentro da janela de aviso?
 *
 * É a coluna `notice` que o GLPI tem e ninguém lê: lá o contrato vence e
 * alguém descobre pela fatura. Renovação automática não dispensa o
 * aviso — ela o torna mais urgente, porque é a última chance de não
 * renovar.
 */
export function precisaAvisar(
  contrato: { endsAt: string | null; noticeDays: number; isActive: boolean },
  agora = new Date(),
): boolean {
  if (!contrato.isActive) return false;
  const dias = diasParaVencer(contrato.endsAt, agora);
  return dias !== null && dias <= contrato.noticeDays;
}

export const COST_KINDS = ['TEMPO', 'MATERIAL', 'FIXO'] as const;
export type CostKind = (typeof COST_KINDS)[number];

export const ROTULO_CUSTO: Record<CostKind, string> = {
  TEMPO: 'Tempo',
  MATERIAL: 'Material',
  FIXO: 'Fixo',
};

/**
 * Dinheiro em reais, como se lê.
 *
 * Mora aqui porque a API também formata: o CSV do relatório sai com o
 * mesmo texto da tela, e duas formatações divergem no primeiro
 * arredondamento.
 */
export function emReais(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
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
 * Troca os marcadores pelos valores. O motor, sem vocabulário.
 *
 * Marcador desconhecido fica **como está**, visível no texto: sumir com
 * ele faria a frase perder um pedaço sem ninguém reparar, e é
 * justamente o que acontece quando alguém renomeia um campo.
 */
function preencher(texto: string, contexto: Record<string, string | undefined>): string {
  return texto.replace(MARCADOR, (inteiro, campo: string) => contexto[campo] ?? inteiro);
}

/** Os marcadores do texto que não estão na lista. */
function foraDaLista(texto: string, conhecidos: readonly string[]): string[] {
  const lista = new Set<string>(conhecidos);
  const achados = [...texto.matchAll(MARCADOR)].map((m) => m[1]!);
  return [...new Set(achados.filter((c) => !lista.has(c)))];
}

/**
 * Preenche o modelo de resposta, solução ou tarefa.
 *
 * `marcadoresInvalidos` existe para a tela de configuração recusar
 * antes — errar na hora de salvar é barato, errar na resposta ao
 * cliente não é.
 */
export function preencherModelo(texto: string, contexto: ContextoDoModelo): string {
  return preencher(texto, contexto);
}

/** Os marcadores do texto que não existem. */
export function marcadoresInvalidos(texto: string): string[] {
  return foraDaLista(texto, CAMPOS_DO_MODELO);
}

// ---------------------------------------------------------------------
// Termos de compromisso e de quebra
// ---------------------------------------------------------------------

/**
 * Os dois papéis que a pessoa assina.
 *
 * `COMPROMISSO` na entrega: ela recebe o equipamento e se compromete a
 * guardá-lo. `QUEBRA` na devolução com dano: ela reconhece o que
 * aconteceu, e o documento registra o estado em que o equipamento
 * voltou.
 */
export const TERM_KINDS = ['COMPROMISSO', 'QUEBRA'] as const;
export type TermKind = (typeof TERM_KINDS)[number];

export const ROTULO_TERMO: Record<TermKind, string> = {
  COMPROMISSO: 'Termo de compromisso',
  QUEBRA: 'Termo de quebra',
};

/**
 * O que o texto do termo pode interpolar.
 *
 * Lista fechada, pela mesma razão do modelo de resposta: um motor de
 * expressões dentro do texto seria mais uma linguagem para manter.
 *
 * Não há marcador para o documento de quem assina — `User` não guarda
 * CPF. Um marcador que sempre renderiza vazio é pior que marcador
 * nenhum: ele deixa uma lacuna no papel e a impressão de que o dado
 * está lá.
 */
export const CAMPOS_DO_TERMO = [
  'pessoa.nome',
  'empresa.nome',
  'empresa.documento',
  'equipamento.nome',
  'equipamento.tipo',
  'equipamento.patrimonio',
  'equipamento.serie',
  'equipamento.fabricante',
  'equipamento.modelo',
  'equipamento.destino',
  'ocorrencia.descricao',
  'organizacao.nome',
  'termo.data',
] as const;

export type CampoDoTermo = (typeof CAMPOS_DO_TERMO)[number];
export type ContextoDoTermo = Partial<Record<CampoDoTermo, string>>;

export function preencherTermo(texto: string, contexto: ContextoDoTermo): string {
  return preencher(texto, contexto);
}

/** Os marcadores do termo que não existem. */
export function marcadoresInvalidosDoTermo(texto: string): string[] {
  return foraDaLista(texto, CAMPOS_DO_TERMO);
}

/**
 * O texto que a instalação começa usando.
 *
 * **Ponto de partida, não parecer jurídico.** Quem responde por contrato
 * na casa tem de ler e ajustar antes do primeiro uso — é por isso que o
 * texto é editável por organização, e é por isso que ele é congelado no
 * momento da assinatura: mudar o modelo depois não pode mudar o que
 * alguém já assinou.
 */
export const TEXTO_PADRAO_DO_TERMO: Record<TermKind, string> = {
  COMPROMISSO: `TERMO DE COMPROMISSO E RESPONSABILIDADE — GUARDA DE EQUIPAMENTO

Eu, {{pessoa.nome}}, declaro ter recebido de {{empresa.nome}}, em
{{termo.data}}, o equipamento abaixo, em condições de uso, para o
desempenho das minhas atividades:

  Equipamento: {{equipamento.nome}} ({{equipamento.tipo}})
  Fabricante e modelo: {{equipamento.fabricante}} {{equipamento.modelo}}
  Patrimônio: {{equipamento.patrimonio}}
  Número de série: {{equipamento.serie}}

E me comprometo a:

1. Utilizar o equipamento exclusivamente para as atividades
   profissionais a que ele se destina.
2. Zelar pela sua guarda e conservação, adotando os cuidados que
   adotaria com bem próprio, e mantê-lo protegido de calor, umidade,
   quedas e líquidos.
3. Não emprestar, ceder, alienar nem permitir o uso por terceiros.
4. Não remover, substituir nem alterar componentes, lacres, etiquetas de
   patrimônio ou o sistema operacional sem autorização.
5. Comunicar imediatamente, pelo canal de atendimento, qualquer defeito,
   dano, furto, roubo ou extravio, bem como qualquer mudança de
   endereço em que o equipamento passe a ficar.
6. Devolver o equipamento, com todos os seus acessórios, quando
   solicitado ou ao término do vínculo, no mesmo estado em que o recebi,
   ressalvado o desgaste natural do uso regular.

Declaro estar ciente de que o equipamento é patrimônio de
{{empresa.nome}}, e de que o uso em desacordo com este termo, bem como o
dano decorrente de negligência, imprudência ou imperícia, poderá ser
objeto de apuração e de ressarcimento na forma da lei e das normas
internas aplicáveis.

Declaro, ainda, estar ciente de que o equipamento pode conter
informações de titularidade de {{empresa.nome}} e de terceiros, e me
comprometo a preservar o sigilo delas.

{{termo.data}}


_______________________________________
{{pessoa.nome}}


Registrado por {{organizacao.nome}}.`,

  QUEBRA: `TERMO DE OCORRÊNCIA — DANO EM EQUIPAMENTO

Eu, {{pessoa.nome}}, declaro que o equipamento abaixo, que estava sob a
minha guarda por força de termo de compromisso firmado com
{{empresa.nome}}, apresentou o dano descrito nesta data:

  Equipamento: {{equipamento.nome}} ({{equipamento.tipo}})
  Fabricante e modelo: {{equipamento.fabricante}} {{equipamento.modelo}}
  Patrimônio: {{equipamento.patrimonio}}
  Número de série: {{equipamento.serie}}

Descrição da ocorrência:

{{ocorrencia.descricao}}

Declaro que as informações acima são verdadeiras e que o equipamento foi
devolvido nesta data, tendo como destino: {{equipamento.destino}}.

Declaro estar ciente de que a ocorrência será apurada, e de que o dano
decorrente de negligência, imprudência ou imperícia poderá ser objeto de
ressarcimento na forma da lei e das normas internas aplicáveis.

{{termo.data}}


_______________________________________
{{pessoa.nome}}


Registrado por {{organizacao.nome}}.`,
};

/**
 * O que entra no lugar do marcador quando o dado não existe.
 *
 * Um travessão, e não vazio: "Patrimônio:" seguido de nada parece campo
 * esquecido na impressão; seguido de "—" diz que não há patrimônio.
 */
export const SEM_DADO_NO_TERMO = '—';

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
 * Os status em que o relógio do SLA **não corre**.
 *
 * ## Por que é uma lista, e não um `if`
 *
 * Era `if (status === 'PENDENTE')`, espalhado por três lugares. O efeito
 * disso apareceu com a aprovação: um chamado esperando o aval do gestor
 * queimava SLA, e a culpa saía no relatório da equipe, que não tinha o
 * que fazer. Quem demora é quem aprova.
 *
 * Como lista, incluir um status novo é uma linha aqui — e não uma
 * caçada por todos os `if` que alguém esqueceu de atualizar. É o desenho
 * do OcoMon (`status.stat_time_freeze`), que acertou nisto: congelar é
 * propriedade do status, não regra escondida no código.
 *
 * **`PENDENTE` e `EM_APROVACAO` param por razões diferentes.** No
 * primeiro a bola está com o cliente; no segundo, com o gestor. Nos dois
 * o tempo não é da equipe de atendimento, que é o que o SLA mede.
 *
 * `SOLUCIONADO` e `FECHADO` não entram: ali o compromisso já foi
 * cumprido ou perdido, e o relógio parou por outro motivo.
 */
export const STATUS_QUE_PARAM_O_RELOGIO: readonly TicketStatus[] = [
  'PENDENTE',
  'EM_APROVACAO',
];

/** O relógio do SLA para neste status? */
export function paraORelogio(status: TicketStatus): boolean {
  return STATUS_QUE_PARAM_O_RELOGIO.includes(status);
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

// ---------------------------------------------------------------------
// Componentes do ativo — substitui os ~60 `Device*` / `Item_Device*`
// ---------------------------------------------------------------------

/**
 * O que se pendura dentro de um equipamento.
 *
 * No GLPI cada um destes é **duas** tabelas: `glpi_deviceprocessors`
 * mais `glpi_items_deviceprocessors`, `glpi_devicememories` mais
 * `glpi_items_devicememories`, e assim por diante — perto de sessenta
 * ao todo, com o mesmo desenho repetido. Toda tela nova precisa saber
 * em qual delas olhar, e uma consulta de "quanta memória a frota tem"
 * é uma união de dezessete `SELECT`.
 *
 * Aqui é uma tabela com um discriminador. O que muda de um tipo para o
 * outro são os atributos, e atributo por tipo é ficha — não schema.
 */
export const COMPONENT_KINDS = [
  'PROCESSADOR',
  'MEMORIA',
  'DISCO',
  'PLACA_MAE',
  'PLACA_DE_REDE',
  'PLACA_DE_VIDEO',
  'PLACA_DE_SOM',
  'CONTROLADORA',
  'FONTE',
  'BATERIA',
  'UNIDADE_OTICA',
  'FIRMWARE',
  'GABINETE',
  'CAMERA',
  'SENSOR',
  'SIMCARD',
  'OUTRO',
] as const;

export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export const ROTULO_COMPONENTE: Record<ComponentKind, string> = {
  PROCESSADOR: 'Processador',
  MEMORIA: 'Memória',
  DISCO: 'Disco',
  PLACA_MAE: 'Placa-mãe',
  PLACA_DE_REDE: 'Placa de rede',
  PLACA_DE_VIDEO: 'Placa de vídeo',
  PLACA_DE_SOM: 'Placa de som',
  CONTROLADORA: 'Controladora',
  FONTE: 'Fonte',
  BATERIA: 'Bateria',
  UNIDADE_OTICA: 'Unidade óptica',
  FIRMWARE: 'Firmware',
  GABINETE: 'Gabinete',
  CAMERA: 'Câmera',
  SENSOR: 'Sensor',
  SIMCARD: 'SIM',
  OUTRO: 'Outro',
};

/**
 * Um campo da ficha do componente.
 *
 * É um `FormField` com unidade. A ficha é validada pelo mesmo
 * `validarRespostas` do formulário dinâmico: um formulário é um
 * formulário, e ter dois validadores seria ter dois comportamentos
 * para a mesma pergunta. A diferença é que esta ficha **não se edita
 * pela tela** — um pente DDR4 tem os campos que tem, e deixar o
 * administrador inventar "capacidade2" só produziria inventário que
 * não soma.
 */
export type AtributoDoComponente = FormField & { unidade?: string };

const opcoes = (...valores: string[]) => valores.map((v) => ({ value: v, label: v }));

export const ATRIBUTOS_DO_COMPONENTE: Record<ComponentKind, readonly AtributoDoComponente[]> = {
  PROCESSADOR: [
    { key: 'nucleos', label: 'Núcleos', type: 'NUMERO', required: false },
    { key: 'threads', label: 'Threads', type: 'NUMERO', required: false },
    { key: 'frequencia', label: 'Frequência', type: 'NUMERO', required: false, unidade: 'MHz' },
    {
      key: 'arquitetura',
      label: 'Arquitetura',
      type: 'SELECAO',
      required: false,
      options: opcoes('x86_64', 'x86', 'ARM64'),
    },
  ],
  MEMORIA: [
    // Em MB, não em GB: pente de 512 MB ainda existe em equipamento
    // velho, e somar a frota inteira em inteiro evita o 0,5 + 0,5 que
    // não fecha.
    { key: 'capacidade', label: 'Capacidade', type: 'NUMERO', required: true, unidade: 'MB' },
    {
      key: 'tecnologia',
      label: 'Tecnologia',
      type: 'SELECAO',
      required: false,
      options: opcoes('DDR3', 'DDR4', 'DDR5', 'LPDDR4', 'LPDDR5'),
    },
    { key: 'frequencia', label: 'Frequência', type: 'NUMERO', required: false, unidade: 'MHz' },
    { key: 'slot', label: 'Slot', type: 'TEXTO', required: false },
  ],
  DISCO: [
    { key: 'capacidade', label: 'Capacidade', type: 'NUMERO', required: true, unidade: 'GB' },
    {
      key: 'tecnologia',
      label: 'Tecnologia',
      type: 'SELECAO',
      required: false,
      options: opcoes('HDD', 'SSD', 'NVMe'),
    },
    {
      key: 'interface',
      label: 'Interface',
      type: 'SELECAO',
      required: false,
      options: opcoes('SATA', 'SAS', 'NVMe', 'USB'),
    },
    { key: 'rotacao', label: 'Rotação', type: 'NUMERO', required: false, unidade: 'RPM' },
  ],
  PLACA_MAE: [
    { key: 'chipset', label: 'Chipset', type: 'TEXTO', required: false },
    { key: 'soquete', label: 'Soquete', type: 'TEXTO', required: false },
  ],
  PLACA_DE_REDE: [
    { key: 'velocidade', label: 'Velocidade', type: 'NUMERO', required: false, unidade: 'Mbps' },
    { key: 'mac', label: 'Endereço MAC', type: 'TEXTO', required: false },
    { key: 'sem_fio', label: 'Sem fio', type: 'BOOLEANO', required: false },
  ],
  PLACA_DE_VIDEO: [
    { key: 'memoria', label: 'Memória', type: 'NUMERO', required: false, unidade: 'MB' },
    { key: 'chipset', label: 'Chipset', type: 'TEXTO', required: false },
  ],
  PLACA_DE_SOM: [{ key: 'chipset', label: 'Chipset', type: 'TEXTO', required: false }],
  CONTROLADORA: [
    { key: 'interface', label: 'Interface', type: 'TEXTO', required: false },
  ],
  FONTE: [
    { key: 'potencia', label: 'Potência', type: 'NUMERO', required: false, unidade: 'W' },
    { key: 'redundante', label: 'Redundante', type: 'BOOLEANO', required: false },
  ],
  BATERIA: [
    { key: 'capacidade', label: 'Capacidade', type: 'NUMERO', required: false, unidade: 'mWh' },
    { key: 'tensao', label: 'Tensão', type: 'NUMERO', required: false, unidade: 'mV' },
    {
      key: 'quimica',
      label: 'Química',
      type: 'SELECAO',
      required: false,
      options: opcoes('Li-ion', 'Li-Po', 'NiMH', 'Chumbo'),
    },
  ],
  UNIDADE_OTICA: [
    {
      key: 'tecnologia',
      label: 'Tecnologia',
      type: 'SELECAO',
      required: false,
      options: opcoes('CD', 'DVD', 'Blu-ray'),
    },
    { key: 'gravador', label: 'Grava', type: 'BOOLEANO', required: false },
  ],
  FIRMWARE: [
    { key: 'versao', label: 'Versão', type: 'TEXTO', required: true },
    { key: 'data', label: 'Data', type: 'DATA', required: false },
  ],
  GABINETE: [
    {
      key: 'formato',
      label: 'Formato',
      type: 'SELECAO',
      required: false,
      options: opcoes('Torre', 'Mini', 'SFF', 'Rack'),
    },
  ],
  CAMERA: [{ key: 'resolucao', label: 'Resolução', type: 'TEXTO', required: false }],
  SENSOR: [{ key: 'tipo', label: 'Tipo', type: 'TEXTO', required: false }],
  SIMCARD: [
    // O GLPI guarda PIN e PUK do chip em coluna de texto. Não copiamos:
    // é credencial, e inventário não é cofre.
    { key: 'numero', label: 'Número', type: 'TEXTO', required: false },
    { key: 'operadora', label: 'Operadora', type: 'TEXTO', required: false },
    { key: 'iccid', label: 'ICCID', type: 'TEXTO', required: false },
  ],
  OUTRO: [],
};

/** A ficha do tipo, no formato que `validarRespostas` já entende. */
export function esquemaDoComponente(kind: ComponentKind): FormSchema {
  return { fields: [...ATRIBUTOS_DO_COMPONENTE[kind]] };
}

export function validarAtributos(
  kind: ComponentKind,
  atributos: Record<string, unknown>,
): ErroDeCampo[] {
  return validarRespostas(esquemaDoComponente(kind), atributos);
}

/**
 * Capacidade legível a partir de megabytes.
 *
 * `1024` vira "1 GB" e `1572864` vira "1,5 TB". Inventário se lê em
 * GB e TB; o banco guarda MB porque é o menor que ainda soma inteiro.
 */
export function emCapacidade(megabytes: number): string {
  if (!Number.isFinite(megabytes)) return '—';
  if (megabytes >= 1024 * 1024) return `${arredondar(megabytes / (1024 * 1024))} TB`;
  if (megabytes >= 1024) return `${arredondar(megabytes / 1024)} GB`;
  return `${arredondar(megabytes)} MB`;
}

function arredondar(valor: number): string {
  const uma = Math.round(valor * 10) / 10;
  return Number.isInteger(uma) ? String(uma) : uma.toString().replace('.', ',');
}

type ComponenteResumivel = {
  kind: ComponentKind;
  name: string;
  attributes: Record<string, unknown>;
};

/**
 * A linha que descreve o componente numa lista.
 *
 * "16 GB DDR4 · 2666 MHz" diz mais que "Memória — Kingston". É aqui,
 * numa função pura, porque a tela e o relatório precisam escrever a
 * mesma frase — e no GLPI cada tela monta a sua.
 */
export function descreverComponente(c: ComponenteResumivel): string {
  const a = c.attributes ?? {};
  const numero = (chave: string): number | null =>
    typeof a[chave] === 'number' && Number.isFinite(a[chave] as number) ? (a[chave] as number) : null;
  const texto = (chave: string): string | null =>
    typeof a[chave] === 'string' && (a[chave] as string).trim() ? (a[chave] as string) : null;

  const partes: string[] = [];

  switch (c.kind) {
    case 'MEMORIA': {
      const capacidade = numero('capacidade');
      const cabeca = [capacidade === null ? null : emCapacidade(capacidade), texto('tecnologia')]
        .filter(Boolean)
        .join(' ');
      if (cabeca) partes.push(cabeca);
      const f = numero('frequencia');
      if (f !== null) partes.push(`${f} MHz`);
      break;
    }
    case 'DISCO': {
      const capacidade = numero('capacidade');
      const cabeca = [
        capacidade === null ? null : emCapacidade(capacidade * 1024),
        texto('tecnologia'),
      ]
        .filter(Boolean)
        .join(' ');
      if (cabeca) partes.push(cabeca);
      const i = texto('interface');
      if (i && i !== texto('tecnologia')) partes.push(i);
      break;
    }
    case 'PROCESSADOR': {
      const n = numero('nucleos');
      if (n !== null) partes.push(`${n} ${n === 1 ? 'núcleo' : 'núcleos'}`);
      const f = numero('frequencia');
      if (f !== null) partes.push(f >= 1000 ? `${arredondar(f / 1000)} GHz` : `${f} MHz`);
      break;
    }
    case 'PLACA_DE_VIDEO': {
      const m = numero('memoria');
      if (m !== null) partes.push(emCapacidade(m));
      const chipset = texto('chipset');
      if (chipset) partes.push(chipset);
      break;
    }
    case 'FONTE': {
      const p = numero('potencia');
      if (p !== null) partes.push(`${p} W`);
      break;
    }
    default: {
      // Sem frase própria, a ficha vira a frase: só o que está
      // preenchido, na ordem em que o tipo declara.
      for (const campo of ATRIBUTOS_DO_COMPONENTE[c.kind]) {
        const valor = a[campo.key];
        if (valor === undefined || valor === null || valor === '') continue;
        const escrito =
          typeof valor === 'boolean'
            ? valor
              ? campo.label
              : null
            : `${String(valor)}${campo.unidade ? ` ${campo.unidade}` : ''}`;
        if (escrito) partes.push(escrito);
      }
    }
  }

  return partes.join(' · ') || c.name;
}

export type ResumoDeHardware = {
  /** Soma dos pentes, em MB. */
  memoriaMB: number;
  /** Soma dos discos, em MB. */
  armazenamentoMB: number;
  nucleos: number;
  total: number;
};

/**
 * O que a máquina tem, somado.
 *
 * É a pergunta que o GLPI não responde sem exportar: lá "16 GB" são
 * duas linhas de 8192 em `glpi_items_devicememories` que ninguém soma
 * na tela. Um pente é uma linha — não há campo de quantidade, porque
 * cada pente tem o seu número de série e o seu slot.
 */
export function resumoDoHardware(componentes: ComponenteResumivel[]): ResumoDeHardware {
  const resumo: ResumoDeHardware = {
    memoriaMB: 0,
    armazenamentoMB: 0,
    nucleos: 0,
    total: componentes.length,
  };

  for (const c of componentes) {
    const valor = (chave: string): number =>
      typeof c.attributes?.[chave] === 'number' ? (c.attributes[chave] as number) : 0;

    if (c.kind === 'MEMORIA') resumo.memoriaMB += valor('capacidade');
    if (c.kind === 'DISCO') resumo.armazenamentoMB += valor('capacidade') * 1024;
    if (c.kind === 'PROCESSADOR') resumo.nucleos += valor('nucleos');
  }

  return resumo;
}

// ---------------------------------------------------------------------
// Carteira de clientes: login gerado e PIN
// ---------------------------------------------------------------------

/** Partículas que não são sobrenome: "Yuri Souza de Goes" → goes. */
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'di', 'du', 'van', 'von']);

/** Sem acento, sem cedilha, sem o que não é letra ou dígito. */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * O login da pessoa do cliente, a partir do nome e do domínio da
 * empresa.
 *
 * "Yuri Souza Goes" na empresadojoao.com.br vira
 * `yuri.goes@empresadojoao.com.br`: primeiro nome e último sobrenome,
 * que é como a pessoa se apresenta. Partícula não é sobrenome — "Yuri
 * Souza de Goes" também dá `yuri.goes`, e não `yuri.de`.
 *
 * Devolve nulo quando não sobra nome utilizável (só partículas, só
 * pontuação, vazio): quem chama decide o que fazer, em vez de receber
 * um `@dominio` solto.
 */
export function loginDoCliente(nomeCompleto: string, dominio: string): string | null {
  const partes = nomeCompleto
    .trim()
    .split(/\s+/)
    .map(semAcento)
    .filter((p) => p.length > 0);

  const uteis = partes.filter((p) => !PARTICULAS.has(p));
  if (uteis.length === 0) return null;

  const dom = dominio.trim().toLowerCase().replace(/^@/, '');
  if (!dom) return null;

  const primeiro = uteis[0];
  // Com um nome só, o login é ele: "Madonna" não vira "madonna.madonna".
  const ultimo = uteis.length > 1 ? uteis[uteis.length - 1] : '';
  const local = ultimo ? `${primeiro}.${ultimo}` : primeiro;

  return `${local}@${dom}`;
}

/**
 * O próximo login livre, quando o gerado já existe.
 *
 * Duas pessoas com o mesmo nome numa empresa de cem é questão de tempo,
 * e o segundo cadastro não pode falhar em cima do primeiro. O sufixo
 * começa em 2 porque "yuri.goes2" só faz sentido se existe um sem
 * número.
 */
export function loginLivre(desejado: string, ocupados: Iterable<string>): string {
  const usados = new Set([...ocupados].map((e) => e.trim().toLowerCase()));
  if (!usados.has(desejado.toLowerCase())) return desejado;

  const [local, dominio] = desejado.split('@');
  for (let n = 2; n < 1000; n += 1) {
    const tentativa = `${local}${n}@${dominio}`;
    if (!usados.has(tentativa)) return tentativa;
  }
  throw new Error(`Mil logins iguais a "${desejado}": algo está errado no cadastro.`);
}

/** Dígitos do PIN do portal do cliente. Seis: um milhão de combinações. */
export const DIGITOS_DO_PIN = 6;

/**
 * O PIN serve?
 *
 * Seis dígitos são um milhão de combinações — cem vezes mais que
 * quatro, e ainda se decora. O que se recusa aqui é o que anula isso:
 * sequência (123456), repetição (111111) e data de nascimento no
 * formato que todo mundo usa (ddmmaa não é sorteio).
 */
export function pinFraco(pin: string): string | null {
  if (!new RegExp(`^\\d{${DIGITOS_DO_PIN}}$`).test(pin)) {
    return `O PIN tem ${DIGITOS_DO_PIN} dígitos.`;
  }

  if (new Set(pin).size === 1) return 'Um dígito repetido seis vezes não protege nada.';

  const digitos = [...pin].map(Number);
  const crescente = digitos.every((d, i) => i === 0 || d === digitos[i - 1] + 1);
  const decrescente = digitos.every((d, i) => i === 0 || d === digitos[i - 1] - 1);
  if (crescente || decrescente) return 'Sequência é a primeira coisa que se tenta.';

  return null;
}

/** `5511999999999@s.whatsapp.net` → `+5511999999999` */
export function normalizePhone(raw: string): string {
  const digits = raw.split('@')[0].replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

// ---------------------------------------------------------------------
// Atendimento agendado
// ---------------------------------------------------------------------

/** Uma visita não dura zero minutos, e nem um mês. */
export const DURACAO_MINIMA_MINUTOS = 15;
export const DURACAO_MAXIMA_MINUTOS = 12 * 60;

/** No máximo um ano à frente: data mais distante é dedo escorregando. */
const HORIZONTE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * O que impede este agendamento, ou `null` se nada impede.
 *
 * Devolve a frase que a pessoa lê. Marcar para trás não é agendamento —
 * é acerto de registro, e para isso existe o apontamento de tempo na
 * tarefa.
 */
export function agendamentoInvalido(
  quando: Date,
  duracaoMinutos: number,
  agora: Date = new Date(),
): string | null {
  if (Number.isNaN(quando.getTime())) return 'Data inválida.';
  if (quando <= agora) return 'O atendimento tem de ser marcado para a frente.';
  if (quando.getTime() - agora.getTime() > HORIZONTE_MS) {
    return 'O atendimento não pode ser marcado para mais de um ano à frente.';
  }
  if (!Number.isInteger(duracaoMinutos)) return 'A duração tem de ser em minutos inteiros.';
  if (duracaoMinutos < DURACAO_MINIMA_MINUTOS) {
    return `A duração mínima é de ${DURACAO_MINIMA_MINUTOS} minutos.`;
  }
  if (duracaoMinutos > DURACAO_MAXIMA_MINUTOS) {
    return `A duração máxima é de ${DURACAO_MAXIMA_MINUTOS / 60} horas.`;
  }
  return null;
}

/** O instante em que a visita termina. */
export function fimDoAtendimento(quando: Date, duracaoMinutos: number): Date {
  return new Date(quando.getTime() + duracaoMinutos * 60_000);
}

/**
 * O vencimento que a visita marcada exige, ou `null` se ela cabe no
 * prazo que já existe.
 *
 * O `null` é a parte que importa: marcar visita para amanhã num chamado
 * que vence semana que vem não estica prazo nenhum. Adiar assim mesmo
 * seria dar folga que ninguém pediu — e é exatamente por essa porta que
 * um indicador de SLA deixa de significar alguma coisa.
 */
export function vencimentoComAtendimento(
  vencimento: Date,
  quando: Date,
  duracaoMinutos: number,
): Date | null {
  const fim = fimDoAtendimento(quando, duracaoMinutos);
  return fim > vencimento ? fim : null;
}

// ---------------------------------------------------------------------
// Bloqueio progressivo
// ---------------------------------------------------------------------

/**
 * Quanto tempo uma chave fica barrada depois de `falhas` erros.
 *
 * A escada existe por causa do PIN de seis dígitos: um milhão de
 * combinações cai em minutos contra uma porta que não tranca. Com ela,
 * mil tentativas levam mais de um dia — e quem erra o PIN duas vezes
 * seguidas nem percebe que existe uma escada.
 *
 * As três primeiras falhas não barram nada de propósito: digitar
 * errado é o caso comum, e transformar isso em bloqueio produz ligação
 * para o suporte, não segurança.
 *
 * Devolve segundos; zero é "ainda não barra".
 */
export function bloqueioProgressivo(falhas: number): number {
  if (falhas < 4) return 0;
  if (falhas === 4) return 30;
  if (falhas === 5) return 60;
  if (falhas === 6) return 5 * 60;
  if (falhas <= 8) return 15 * 60;
  return 60 * 60;
}

/** Depois deste tempo sem erro, a contagem de falhas recomeça do zero. */
export const JANELA_DE_FALHAS_SEGUNDOS = 30 * 60;

// ---------------------------------------------------------------------
// Protocolo público
// ---------------------------------------------------------------------

/**
 * O alfabeto do protocolo.
 *
 * Sem `0`/`O`, `1`/`I`/`L`, `5`/`S`, `B`/`8` e `U`/`V`: o protocolo é
 * ditado ao telefone e copiado do papel, e esses pares se confundem nas
 * duas operações. As vogais saem junto, o que de quebra impede o
 * sorteio de formar palavra que ninguém quer ver num documento com a
 * marca da casa.
 */
export const ALFABETO_DO_PROTOCOLO = '234679CDFGHJKMNPQRTWXYZ';

/** Dois grupos de quatro. 23^8 ≈ 8·10^10 (37 bits) — enumerar é inviável. */
export const TAMANHO_DO_PROTOCOLO = 8;

/**
 * O protocolo é sorteado, e não o número sequencial do chamado.
 *
 * Esta é a decisão que faz a consulta pública ser segura: `#124` seria
 * `#123` mais um, e quem tivesse um protocolo teria todos. Com oito
 * caracteres sorteados, tentar adivinhar o do vizinho é o mesmo que
 * tentar adivinhar uma senha — e a escada de bloqueio por IP fecha o
 * resto.
 */
export function formatarProtocolo(cru: string): string {
  const limpo = cru.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return limpo.length === TAMANHO_DO_PROTOCOLO
    ? `${limpo.slice(0, 4)}-${limpo.slice(4)}`
    : limpo;
}

/**
 * Normaliza o que a pessoa digitou, ou `null` se aquilo não é um
 * protocolo.
 *
 * Aceita com e sem traço, em qualquer caixa, com espaço sobrando —
 * recusar `4k7p wz9n` porque veio em minúsculas seria pedir à pessoa
 * que faça o trabalho da máquina.
 *
 * Não tenta adivinhar troca de caractere. A defesa contra `O` e `0`
 * confundidos é o alfabeto, que não tem nenhum dos dois: quem digitou
 * um deles não errou a fonte, errou o código.
 */
export function normalizarProtocolo(digitado: string): string | null {
  const limpo = digitado.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (limpo.length !== TAMANHO_DO_PROTOCOLO) return null;
  for (const c of limpo) if (!ALFABETO_DO_PROTOCOLO.includes(c)) return null;
  return limpo;
}

// ---------------------------------------------------------------------
// Ordem de serviço
// ---------------------------------------------------------------------

export const SERVICE_ORDER_STATUSES = [
  'RASCUNHO',
  'EXECUTANDO',
  'CONCLUIDA',
  'CANCELADA',
] as const;
export type ServiceOrderStatus = (typeof SERVICE_ORDER_STATUSES)[number];

export const ROTULO_ORDEM: Record<ServiceOrderStatus, string> = {
  RASCUNHO: 'Rascunho',
  EXECUTANDO: 'Em execução',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/**
 * Ordem assinada não muda.
 *
 * A assinatura atesta a lista de itens que estava na tela naquele
 * momento. Deixar editá-la depois transformaria o documento numa
 * declaração de qualquer coisa — e é justamente o documento que o
 * cliente guarda como prova do atendimento.
 */
export function ordemEditavel(status: ServiceOrderStatus): boolean {
  return status === 'RASCUNHO' || status === 'EXECUTANDO';
}

/**
 * O que impede concluir esta ordem, ou `null` se nada impede.
 *
 * Um item deixado por fazer não impede: visita em que nem tudo coube é
 * a regra, não a exceção, e o documento tem de poder dizer isso. O que
 * ele não pode é sair em branco — ordem sem nenhum item registrado não
 * atesta atendimento nenhum.
 */
export function ordemInconclusivel(
  status: ServiceOrderStatus,
  itens: readonly { done: boolean }[],
): string | null {
  if (status === 'CONCLUIDA') return 'Esta ordem já foi concluída.';
  if (status === 'CANCELADA') return 'Esta ordem foi cancelada.';
  if (itens.length === 0) return 'Inclua ao menos um item antes de concluir.';
  if (!itens.some((i) => i.done)) {
    return 'Marque ao menos um item como realizado — ou cancele a ordem.';
  }
  return null;
}

/** Tamanho máximo do PNG da assinatura: um traço, não uma foto. */
export const TAMANHO_MAXIMO_DA_ASSINATURA = 512 * 1024;

/**
 * Valida a imagem da assinatura vinda do `<canvas>`.
 *
 * Aceita **só** `image/png` em `data:`. O campo recebe o que o
 * navegador mandar, e um `data:text/html` guardado e servido de volta
 * seria script na origem da API.
 */
export function assinaturaInvalida(dataUrl: string): string | null {
  const prefixo = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefixo)) return 'A assinatura tem de ser uma imagem PNG.';

  const base64 = dataUrl.slice(prefixo.length);
  if (base64.length === 0) return 'Assine antes de concluir.';
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return 'A assinatura chegou corrompida.';

  // 3 bytes viram 4 caracteres em base64.
  if ((base64.length * 3) / 4 > TAMANHO_MAXIMO_DA_ASSINATURA) {
    return 'A assinatura está grande demais.';
  }
  return null;
}

/**
 * Os dois pertencem a empresas-cliente diferentes?
 *
 * Nulo é "da casa", e da casa combina com todo mundo: o notebook de
 * empréstimo vai para o funcionário do cliente, e o teclado do cliente
 * entra na máquina de empréstimo. O que não pode é um ser da empresa do
 * João e o outro da empresa da Maria — aí o nome de uma aparece no
 * histórico da outra, e nenhuma das duas contagens de parque fecha.
 *
 * Mora aqui, e não no serviço de ativos, porque a mesma pergunta é
 * feita em três lugares: o periférico contra a máquina, a pessoa contra
 * o equipamento que recebe, e a troca de empresa contra o que já existe.
 */
export function deClientesDiferentes(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a !== b;
}

// ---------------------------------------------------------------------
// Inventário automático
// ---------------------------------------------------------------------

/**
 * O que fabricante de placa escreve quando não escreveu nada.
 *
 * O SMBIOS tem campo de série obrigatório, e montadora de máquina
 * branca preenche com texto de fábrica. O efeito no inventário é pior
 * que campo vazio: `@@unique([organizationId, serialNumber])` recusa a
 * segunda máquina com "To Be Filled By O.E.M.", e o agente passa a
 * falhar em metade do parque — ou, pior, casa duas máquinas diferentes
 * como se fossem a mesma.
 *
 * Comparado sem acento, sem espaço repetido e em minúsculas, porque a
 * mesma frase aparece com variações de caixa e espaçamento entre
 * fabricantes.
 */
const SERIE_DE_MENTIRA = new Set([
  'tobefilledbyoem',
  'tobefilledbyoem.',
  'defaultstring',
  'systemserialnumber',
  'serialnumber',
  'none',
  'notspecified',
  'notapplicable',
  'na',
  'n/a',
  'unknown',
  'invalid',
  'chassisserialnumber',
  'basemanagementcontroller',
  'oem',
  'xxxxxxx',
  '0',
  '00000000',
  '123456789',
]);

/**
 * A série que serve para identificar, ou nulo.
 *
 * Nulo é melhor que texto de fábrica: a coluna aceita nulo repetido, e
 * o inventário fica dizendo "não sei a série desta" em vez de dizer uma
 * série errada que casa com a máquina do vizinho.
 */
export function serieUtil(valor: string | null | undefined): string | null {
  const limpo = (valor ?? '').trim().replace(/\s+/g, ' ');
  if (!limpo) return null;

  const chave = limpo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s._-]/g, '');

  if (SERIE_DE_MENTIRA.has(chave)) return null;

  // Série de um caractere só, ou só de zeros, não identifica nada.
  if (chave.length < 3) return null;
  if (/^0+$/.test(chave)) return null;

  return limpo;
}

// ---------------------------------------------------------------------
// Identificar a empresa: nome aproximado ou documento exato
// ---------------------------------------------------------------------

/**
 * Formas societárias que não distinguem empresa nenhuma.
 *
 * Sem tirá-las, digitar "ltda" casaria com a carteira inteira: numa
 * busca por semelhança o sufixo comum pontua igual ao nome. Medido:
 * "xyz ltda" contra "Empresa do João … LTDA" dava 0,556 — acima de
 * qualquer limiar razoável — e cai a zero quando o sufixo sai dos dois
 * lados.
 */
const FORMAS_SOCIETARIAS = ['ltda', 'me', 'epp', 'eireli', 'sa', 's/a', 'ss', 's/s'];

/** Mesma regra do `translate` da coluna gerada. Ver a migração. */
const COM_ACENTO = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ';
const SEM_ACENTO = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn';

function tirarAcento(texto: string): string {
  let saida = '';
  for (const c of texto) {
    const i = COM_ACENTO.indexOf(c);
    saida += i >= 0 ? SEM_ACENTO[i] : c;
  }
  return saida;
}

/**
 * O nome de empresa reduzido à forma que a busca compara.
 *
 * Minúsculas, sem acento, sem forma societária no fim, espaços
 * colapsados. A **mesma** transformação é uma coluna gerada no banco
 * (ver a migração); são duas implementações da mesma regra, e por isso
 * existe um teste que confere as duas contra a mesma lista de nomes.
 * Divergir aqui faria a busca não achar o que está gravado.
 *
 * Só o fim é limpo: uma empresa chamada "ME Informática" continua
 * sendo "me informatica", porque ali "ME" é o nome, não a forma.
 */
export function nomeDeEmpresaNormalizado(nome: string): string {
  let texto = tirarAcento(nome).toLowerCase().replace(/\s+/g, ' ').trim();

  // Em laço porque "Alpha Sistemas LTDA ME" tem duas: uma passada só
  // tiraria a última e deixaria a outra pontuando.
  for (;;) {
    const antes = texto;
    for (const forma of FORMAS_SOCIETARIAS) {
      const escapada = forma.replace('/', '\\/');
      texto = texto.replace(new RegExp(`[\\s,]+${escapada}\\.?$`), '');
    }
    texto = texto.trim();
    if (texto === antes) break;
  }

  // Nome que era só a forma societária volta ao que era: melhor buscar
  // por "ltda" do que por nada.
  return texto || tirarAcento(nome).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Só os dígitos. É assim que CNPJ e CPF são comparados. */
export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * O que a pessoa digitou é um documento, e não um nome?
 *
 * A decisão é pela forma, não pelo conteúdo: quem digita onze ou
 * quatorze dígitos está digitando CPF ou CNPJ, com ou sem pontuação.
 * Qualquer outra coisa é nome.
 */
export function pareceDocumento(digitado: string): boolean {
  const digitos = soDigitos(digitado);
  if (digitos.length !== 11 && digitos.length !== 14) return false;

  // Um nome não vira documento por conter números: "Loja 24 Horas" tem
  // dígitos, mas também tem letras.
  return !/[a-zA-Z]/.test(digitado);
}

/** Dígitos verificadores de CNPJ, pelo módulo 11. */
function cnpjConfere(d: string): boolean {
  if (/^(\d)\1{13}$/.test(d)) return false;

  const calcular = (ate: number): number => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < ate; i += 1) soma += Number(d[i]) * pesos[i]!;
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return calcular(12) === Number(d[12]) && calcular(13) === Number(d[13]);
}

/** Dígitos verificadores de CPF, pelo módulo 11. */
function cpfConfere(d: string): boolean {
  if (/^(\d)\1{10}$/.test(d)) return false;

  const calcular = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i += 1) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcular(9) === Number(d[9]) && calcular(10) === Number(d[10]);
}

/**
 * O documento está malformado, ou `null` se está bem formado.
 *
 * Serve para a **mensagem**, não para barrar a busca: dizer "confira os
 * dígitos" é mais útil do que "não encontrei" quando a pessoa trocou um
 * número. Documento bem formado que não existe na carteira continua
 * sendo "não encontrei", que é a verdade.
 */
export function documentoInvalido(digitado: string): string | null {
  const d = soDigitos(digitado);
  if (d.length === 14) return cnpjConfere(d) ? null : 'CNPJ com dígito verificador errado.';
  if (d.length === 11) return cpfConfere(d) ? null : 'CPF com dígito verificador errado.';
  return 'Informe um CNPJ de 14 dígitos ou um CPF de 11.';
}

/** Abaixo disto a semelhança é ruído. Ver a calibração na migração. */
export const SEMELHANCA_MINIMA_DO_NOME = 0.5;

/** Menos que isto não é busca, é a pessoa ainda digitando. */
export const MINIMO_PARA_BUSCAR_EMPRESA = 3;


// ---------------------------------------------------------------------
// Acesso remoto ao equipamento
// ---------------------------------------------------------------------

export const REMOTE_ACCESS_KINDS = [
  'ANYDESK',
  'RUSTDESK',
  'TEAMVIEWER',
  'VNC',
  'RDP',
  'OUTRO',
] as const;
export type RemoteAccessKind = (typeof REMOTE_ACCESS_KINDS)[number];

export const ROTULO_ACESSO_REMOTO: Record<RemoteAccessKind, string> = {
  ANYDESK: 'AnyDesk',
  RUSTDESK: 'RustDesk',
  TEAMVIEWER: 'TeamViewer',
  VNC: 'VNC',
  RDP: 'Área de trabalho remota',
  OUTRO: 'Outro',
};

/**
 * O IP do Tailscale está bem formado?
 *
 * A malha usa `100.64.0.0/10` (CGNAT), e conferir isso evita o engano
 * comum: colar ali o IP da rede local, que não serve para alcançar a
 * máquina de fora e ainda faz o técnico perder a viagem tentando.
 *
 * Devolve a frase que a pessoa lê, ou `null` se está bem formado.
 */
export function tailscaleInvalido(ip: string): string | null {
  const partes = ip.trim().split('.');
  if (partes.length !== 4) return 'O IP do Tailscale tem quatro partes, como 100.101.102.103.';

  const numeros = partes.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  if (numeros.some((n) => n < 0 || n > 255)) return 'Cada parte do IP vai de 0 a 255.';

  // 100.64.0.0/10 vai de 100.64.x.x a 100.127.x.x.
  if (numeros[0] !== 100 || numeros[1]! < 64 || numeros[1]! > 127) {
    return 'O Tailscale usa a faixa 100.64.x.x–100.127.x.x. Esse parece o IP da rede local.';
  }

  return null;
}
