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

  // --- Configuração ---------------------------------------------------
  'config:categorias',
  'config:formularios',
  'config:sla',
  'config:calendario',
  'config:motivos-pendencia',
  'config:regras-entrada',
  'config:canais',
  'config:webhooks',
  'config:chaves-api',

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
 * O que cada perfil pode fazer.
 *
 * A granularidade de leitura (proprios / time / todos) é herdada do
 * GLPI, que acertou nesse ponto: um agente não precisa ver a fila
 * inteira, e um solicitante nunca vê a de ninguém.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
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
  ],

  /** Lê indicadores; não atende chamado. */
  GESTOR: [
    'chamado:ler:todos',
    'artigo:ler',
    'artigo:ler:interno',
    'painel:proprio',
    'painel:time',
    'painel:organizacao',
    'relatorio:exportar',
    'pessoa:ler',
    'auditoria:ler',
  ],

  ADMINISTRADOR: [...PERMISSIONS],
};

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
