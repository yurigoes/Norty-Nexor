/**
 * Matriz de permissões do Norty Desk.
 *
 * Esta é a fonte única: o mesmo objeto esconde o item de menu no
 * aplicativo e alimenta o `PermissionsGuard` da API. Esconder o botão é
 * conveniência; o guard é a proteção.
 *
 * Substitui o modelo de bitmask do GLPI (`ProfileRight`, um inteiro de
 * bits por itemtype). Aqui a permissão tem nome, e responder "por que o
 * fulano não vê este chamado" é ler uma linha.
 *
 * Convenção do nome: `recurso:acao` ou `recurso:acao:escopo`.
 */

export const ROLES = [
  'SOLICITANTE',
  'AGENTE',
  'SUPERVISOR',
  'GESTOR',
  'ADMINISTRADOR',
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // --- Chamado: leitura, com o escopo do GLPI preservado -------------
  /** Vê apenas os chamados em que é requerente ou observador. */
  'chamado:ler:proprios',
  /** Vê os chamados atribuídos ao seu time. */
  'chamado:ler:time',
  /** Vê todos os chamados da organização. */
  'chamado:ler:todos',

  // --- Chamado: escrita ----------------------------------------------
  'chamado:criar',
  'chamado:responder',
  'chamado:nota-interna',
  'chamado:editar',
  'chamado:classificar',
  'chamado:atribuir',
  'chamado:atribuir:a-mim',
  'chamado:mudar-status',
  'chamado:pausar',
  'chamado:resolver',
  'chamado:fechar',
  'chamado:reabrir',
  'chamado:excluir',
  'chamado:vincular',
  'chamado:acao-em-lote',

  // --- Tarefa e tempo -------------------------------------------------
  'tarefa:criar',
  'tarefa:concluir',
  'tarefa:apontar-tempo',

  // --- Anexo ----------------------------------------------------------
  'anexo:enviar',
  'anexo:baixar',
  'anexo:remover',

  // --- Aprovação ------------------------------------------------------
  'aprovacao:solicitar',
  'aprovacao:decidir',

  // --- Problema -------------------------------------------------------
  'problema:ler',
  'problema:gerenciar',

  // --- Mudança --------------------------------------------------------
  'mudanca:ler',
  'mudanca:gerenciar',
  /** Declarar executada, concluída ou revertida. */
  'mudanca:executar',

  // --- Base de conhecimento -------------------------------------------
  'artigo:ler',
  'artigo:ler:interno',
  'artigo:escrever',
  'artigo:publicar',

  // --- Painéis e relatórios -------------------------------------------
  'painel:proprio',
  'painel:time',
  'painel:organizacao',
  'relatorio:exportar',

  // --- Ativos ---------------------------------------------------------
  'ativo:ler',
  'ativo:gerenciar',
  /** Localização, fabricante e modelo — o catálogo que o ativo referencia. */
  'ativo:catalogo',
  /** Registrar a saída de consumível (entregar toner, papel). Entrada e ajuste são de quem gerencia. */
  'consumivel:movimentar',

  // --- Contrato, orçamento e custo -------------------------------------
  'contrato:ler',
  'contrato:gerenciar',
  'custo:ler',
  'custo:lancar',

  // --- Satisfação -----------------------------------------------------
  'satisfacao:ler',
  'satisfacao:configurar',

  // --- Configuração ---------------------------------------------------
  'config:categorias',
  'config:formularios',
  'config:sla',
  'config:calendario',
  'config:motivos-pendencia',
  'config:regras-entrada',
  'config:recorrencia',
  'config:modelos',
  'config:canais',
  'config:webhooks',
  'config:chaves-api',
  /** Fontes de autenticação (LDAP/AD) da organização. */
  'config:autenticacao',

  // --- Pessoas --------------------------------------------------------
  'pessoa:ler',
  'pessoa:gerenciar',
  'time:gerenciar',
  'organizacao:gerenciar',

  // --- Auditoria ------------------------------------------------------
  'auditoria:ler',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissões que uma outra permissão já contém.
 *
 * Os três escopos de leitura de chamado são uma hierarquia, não um
 * conjunto: quem lê todos os chamados evidentemente lê os do seu time e
 * os seus. Declarar isso aqui evita repetir as três em cada perfil — e
 * evita o defeito que essa repetição esquecida causa: uma rota que
 * exige o escopo mais estreito recusar justamente quem tem o mais
 * amplo.
 */
const IMPLICA: Partial<Record<Permission, readonly Permission[]>> = {
  'chamado:ler:todos': ['chamado:ler:time', 'chamado:ler:proprios'],
  'chamado:ler:time': ['chamado:ler:proprios'],
  'chamado:atribuir': ['chamado:atribuir:a-mim'],
  'artigo:publicar': ['artigo:escrever'],
  'artigo:ler:interno': ['artigo:ler'],
  'ativo:gerenciar': ['ativo:ler', 'ativo:catalogo', 'consumivel:movimentar'],
  'ativo:catalogo': ['ativo:ler'],
  'problema:gerenciar': ['problema:ler'],
  'contrato:gerenciar': ['contrato:ler'],
  'custo:lancar': ['custo:ler'],
  'mudanca:gerenciar': ['mudanca:ler'],
  'mudanca:executar': ['mudanca:ler'],
  'satisfacao:configurar': ['satisfacao:ler'],
};

/** Fecha a lista sobre as implicações. */
function expandir(permissoes: readonly Permission[]): readonly Permission[] {
  const conjunto = new Set<Permission>(permissoes);
  for (const permissao of permissoes) {
    for (const implicada of IMPLICA[permissao] ?? []) conjunto.add(implicada);
  }
  return [...conjunto];
}

/**
 * O que cada perfil pode fazer.
 *
 * A granularidade de leitura (proprios / time / todos) é herdada do
 * GLPI, que acertou nesse ponto: um agente não precisa ver a fila
 * inteira, e um solicitante nunca vê a de ninguém.
 */
const MATRIZ_DECLARADA: Record<Role, readonly Permission[]> = {
  SOLICITANTE: [
    'chamado:ler:proprios',
    'chamado:criar',
    'chamado:responder',
    'chamado:fechar',
    'chamado:reabrir',
    'anexo:enviar',
    'anexo:baixar',
    'aprovacao:decidir',
    'artigo:ler',
    'painel:proprio',
  ],

  AGENTE: [
    'chamado:ler:proprios',
    'chamado:ler:time',
    'chamado:criar',
    'chamado:responder',
    'chamado:nota-interna',
    'chamado:editar',
    'chamado:classificar',
    'chamado:atribuir:a-mim',
    'chamado:mudar-status',
    'chamado:pausar',
    'chamado:resolver',
    'chamado:fechar',
    'chamado:vincular',
    'tarefa:criar',
    'tarefa:concluir',
    'tarefa:apontar-tempo',
    'anexo:enviar',
    'anexo:baixar',
    'aprovacao:solicitar',
    'artigo:ler',
    'artigo:ler:interno',
    'artigo:escrever',
    'painel:proprio',
    'painel:time',
    'pessoa:ler',
    'ativo:ler',
    /**
     * Entregar o toner é gesto de quem atende: sem isso o agente troca o
     * cartucho e o estoque só descobre no inventário. Receber compra e
     * ajustar saldo continuam de quem gerencia ativos.
     */
    'consumivel:movimentar',
    /**
     * Ler, não gerenciar — como no ativo. Vincular o chamado ao
     * problema é o gesto de todo dia de quem atende; escrever a causa
     * raiz é outra conversa, e o GLPI acerta ao separar as duas.
     */
    'problema:ler',
    /**
     * Executar sem poder aprovar: quem passa a madrugada aplicando a
     * mudança é quem sabe dizer se ela deu certo, e obrigar um
     * supervisor a marcar "concluída" às três da manhã só produz
     * registro atrasado. O aval continua sendo de outro.
     */
    'mudanca:executar',
    /**
     * Quem trocou a peça sabe quanto ela custou, e lançar na hora é a
     * diferença entre ter o número e reconstruí-lo no fim do mês. Ver o
     * contrato do fornecedor é outra conversa.
     */
    'custo:lancar',
  ],

  SUPERVISOR: [
    'chamado:ler:proprios',
    'chamado:ler:time',
    'chamado:ler:todos',
    'chamado:criar',
    'chamado:responder',
    'chamado:nota-interna',
    'chamado:editar',
    'chamado:classificar',
    'chamado:atribuir',
    'chamado:atribuir:a-mim',
    'chamado:mudar-status',
    'chamado:pausar',
    'chamado:resolver',
    'chamado:fechar',
    'chamado:reabrir',
    'chamado:excluir',
    'chamado:vincular',
    'chamado:acao-em-lote',
    'tarefa:criar',
    'tarefa:concluir',
    'tarefa:apontar-tempo',
    'anexo:enviar',
    'anexo:baixar',
    'anexo:remover',
    'aprovacao:solicitar',
    'aprovacao:decidir',
    'artigo:ler',
    'artigo:ler:interno',
    'artigo:escrever',
    'artigo:publicar',
    'painel:proprio',
    'painel:time',
    'painel:organizacao',
    'relatorio:exportar',
    'pessoa:ler',
    'time:gerenciar',
    'ativo:ler',
    'ativo:gerenciar',
    'problema:ler',
    'problema:gerenciar',
    'mudanca:ler',
    'mudanca:gerenciar',
    'mudanca:executar',
    'contrato:ler',
    'contrato:gerenciar',
    'custo:ler',
    'custo:lancar',
    'satisfacao:ler',
  ],

  /** Lê indicadores e dá aval; não atende chamado. */
  GESTOR: [
    'chamado:ler:todos',
    /**
     * Aprovar é justamente o ato de gestor. O solicitante já decide as
     * aprovações em que é designado — negá-las a quem responde pelo
     * orçamento deixaria o papel sem a única ação que ele exerce sobre
     * o chamado.
     */
    'aprovacao:decidir',
    'artigo:ler',
    'artigo:ler:interno',
    'painel:proprio',
    'painel:time',
    'painel:organizacao',
    'relatorio:exportar',
    'pessoa:ler',
    'auditoria:ler',
    'ativo:ler',
    'problema:ler',
    'mudanca:ler',
    'contrato:ler',
    'custo:ler',
    'satisfacao:ler',
  ],

  ADMINISTRADOR: [...PERMISSIONS],
};

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = Object.fromEntries(
  ROLES.map((role) => [role, expandir(MATRIZ_DECLARADA[role])]),
) as Record<Role, readonly Permission[]>;

/** O perfil tem esta permissão? */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** O perfil tem todas estas permissões? */
export function canAll(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => can(role, permission));
}

/** O perfil tem ao menos uma destas permissões? */
export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

/**
 * O escopo de leitura de chamado do perfil, do mais amplo para o mais
 * restrito. É o que o repositório usa para montar o `where`.
 */
export type TicketReadScope = 'TODOS' | 'TIME' | 'PROPRIOS';

export function ticketReadScope(role: Role): TicketReadScope {
  if (can(role, 'chamado:ler:todos')) return 'TODOS';
  if (can(role, 'chamado:ler:time')) return 'TIME';
  return 'PROPRIOS';
}
