/**
 * VEYRA — Matriz de permissões
 *
 * Esta matriz é a única fonte de verdade do RBAC. Ela esconde o item do
 * menu no aplicativo *e* alimenta o guard da API. Esconder o botão é
 * conveniência; o guard é a proteção.
 *
 * Formato da chave: `modulo.acao`. A ação é sempre um verbo do conjunto
 * fechado abaixo — nada de permissões ad hoc espalhadas pelo código.
 */

import type { ModuleKey, RoleKey, PlatformRoleKey } from './domain.js';

export type PermissionAction =
  | 'visualizar'
  | 'criar'
  | 'editar'
  | 'excluir'
  | 'exportar'
  | 'aprovar'
  | 'cancelar'
  | 'transferir';

export type PermissionKey = `${ModuleKey}.${PermissionAction}` | PlatformPermissionKey;

/** Permissões que só existem no VEYRA Admin, fora de qualquer tenant. */
export type PlatformPermissionKey =
  | 'plataforma.organizacoes'
  | 'plataforma.planos'
  | 'plataforma.assinaturas'
  | 'plataforma.consumo'
  | 'plataforma.provedores_ia'
  | 'plataforma.auditoria'
  | 'plataforma.chaves_api'
  | 'plataforma.recursos_experimentais';

const TODAS_ACOES: PermissionAction[] = [
  'visualizar',
  'criar',
  'editar',
  'excluir',
  'exportar',
  'aprovar',
  'cancelar',
  'transferir',
];

/** Expande um módulo para todas as ações. Uso interno da matriz. */
function todas(modulo: ModuleKey): PermissionKey[] {
  return TODAS_ACOES.map((acao) => `${modulo}.${acao}` as PermissionKey);
}

/** Expande um módulo apenas para as ações informadas. */
function apenas(modulo: ModuleKey, ...acoes: PermissionAction[]): PermissionKey[] {
  return acoes.map((acao) => `${modulo}.${acao}` as PermissionKey);
}

const MODULOS_OPERACIONAIS: ModuleKey[] = [
  'dashboard',
  'intelligence',
  'leads',
  'funil',
  'clientes',
  'conversas',
  'email',
  'cotacoes',
  'propostas',
  'contratos',
  'produtos',
  'campanhas',
  'automacoes',
  'tarefas',
  'agenda',
  'financeiro',
  'comissoes',
  'partners',
  'suporte',
  'conhecimento',
  'relatorios',
  'integracoes',
  'configuracoes',
  'auditoria',
];

/**
 * A matriz. Cada papel lista exatamente o que pode — nada é herdado por
 * implicação. Um papel que não aparece num módulo não vê o módulo.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  /* Dono da conta da empresa cliente. Tudo dentro do próprio tenant —
     e nada fora dele. */
  administrador: MODULOS_OPERACIONAIS.flatMap(todas),

  /* Enxerga a operação inteira e decide, mas não mexe em integração,
     chave de API nem apaga registro financeiro. */
  gestor: [
    ...apenas('dashboard', 'visualizar', 'exportar'),
    ...apenas('intelligence', 'visualizar', 'exportar'),
    ...todas('leads'),
    ...todas('funil'),
    ...todas('clientes'),
    ...apenas('conversas', 'visualizar', 'criar', 'editar', 'transferir'),
    ...apenas('email', 'visualizar', 'criar', 'editar'),
    ...todas('cotacoes'),
    ...todas('propostas'),
    ...apenas('contratos', 'visualizar', 'criar', 'editar', 'aprovar', 'cancelar', 'exportar'),
    ...apenas('produtos', 'visualizar', 'criar', 'editar'),
    ...todas('campanhas'),
    ...apenas('automacoes', 'visualizar', 'criar', 'editar'),
    ...todas('tarefas'),
    ...todas('agenda'),
    ...apenas('financeiro', 'visualizar', 'exportar'),
    ...apenas('comissoes', 'visualizar', 'aprovar', 'exportar'),
    ...apenas('partners', 'visualizar', 'criar', 'editar', 'aprovar'),
    ...apenas('suporte', 'visualizar', 'criar', 'editar', 'transferir'),
    ...apenas('conhecimento', 'visualizar', 'criar', 'editar'),
    ...apenas('relatorios', 'visualizar', 'exportar'),
    ...apenas('configuracoes', 'visualizar', 'editar'),
    ...apenas('auditoria', 'visualizar'),
  ],

  /* Responde por uma equipe. Pode redistribuir lead e conversa, aprovar
     cotação e acompanhar performance — mas não vê o caixa da empresa. */
  supervisor: [
    ...apenas('dashboard', 'visualizar'),
    ...apenas('intelligence', 'visualizar'),
    ...apenas('leads', 'visualizar', 'criar', 'editar', 'transferir', 'exportar'),
    ...apenas('funil', 'visualizar', 'editar'),
    ...apenas('clientes', 'visualizar', 'criar', 'editar'),
    ...apenas('conversas', 'visualizar', 'criar', 'editar', 'transferir'),
    ...apenas('email', 'visualizar', 'criar'),
    ...apenas('cotacoes', 'visualizar', 'criar', 'editar', 'aprovar'),
    ...apenas('propostas', 'visualizar', 'criar', 'editar', 'aprovar'),
    ...apenas('contratos', 'visualizar'),
    ...apenas('produtos', 'visualizar'),
    ...apenas('campanhas', 'visualizar'),
    ...apenas('tarefas', 'visualizar', 'criar', 'editar', 'transferir'),
    ...apenas('agenda', 'visualizar', 'criar', 'editar'),
    ...apenas('comissoes', 'visualizar'),
    ...apenas('suporte', 'visualizar', 'criar', 'editar', 'transferir'),
    ...apenas('conhecimento', 'visualizar', 'criar'),
    ...apenas('relatorios', 'visualizar', 'exportar'),
  ],

  /* A carteira dele. O escopo por responsável é aplicado no service, não
     aqui: a permissão diz "pode ver leads", o filtro diz "os seus". */
  vendedor: [
    ...apenas('dashboard', 'visualizar'),
    ...apenas('intelligence', 'visualizar'),
    ...apenas('leads', 'visualizar', 'criar', 'editar'),
    ...apenas('funil', 'visualizar', 'editar'),
    ...apenas('clientes', 'visualizar', 'criar', 'editar'),
    ...apenas('conversas', 'visualizar', 'criar', 'editar', 'transferir'),
    ...apenas('email', 'visualizar', 'criar'),
    ...apenas('cotacoes', 'visualizar', 'criar', 'editar'),
    ...apenas('propostas', 'visualizar', 'criar', 'editar'),
    ...apenas('contratos', 'visualizar'),
    ...apenas('produtos', 'visualizar'),
    ...apenas('tarefas', 'visualizar', 'criar', 'editar'),
    ...apenas('agenda', 'visualizar', 'criar', 'editar'),
    ...apenas('comissoes', 'visualizar'),
    ...apenas('suporte', 'visualizar', 'criar'),
    ...apenas('conhecimento', 'visualizar'),
  ],

  /* Caixa, cobrança e comissão. Não abre conversa de cliente. */
  financeiro: [
    ...apenas('dashboard', 'visualizar'),
    ...apenas('clientes', 'visualizar'),
    ...apenas('contratos', 'visualizar'),
    ...todas('financeiro'),
    ...todas('comissoes'),
    ...apenas('partners', 'visualizar', 'aprovar'),
    ...apenas('relatorios', 'visualizar', 'exportar'),
    ...apenas('auditoria', 'visualizar'),
  ],

  /* Pós-venda. Vê o cliente inteiro porque precisa resolver, mas não
     mexe em preço, comissão nem campanha. */
  suporte: [
    ...apenas('dashboard', 'visualizar'),
    ...apenas('clientes', 'visualizar', 'editar'),
    ...apenas('conversas', 'visualizar', 'criar', 'editar', 'transferir'),
    ...apenas('email', 'visualizar', 'criar'),
    ...apenas('contratos', 'visualizar'),
    ...todas('suporte'),
    ...apenas('conhecimento', 'visualizar', 'criar', 'editar'),
    ...apenas('tarefas', 'visualizar', 'criar', 'editar'),
    ...apenas('relatorios', 'visualizar'),
  ],

  /* Origem e campanha. Vê lead agregado, não a carteira nominal. */
  marketing: [
    ...apenas('dashboard', 'visualizar'),
    ...apenas('intelligence', 'visualizar'),
    ...apenas('leads', 'visualizar', 'exportar'),
    ...todas('campanhas'),
    ...apenas('automacoes', 'visualizar', 'criar', 'editar'),
    ...apenas('produtos', 'visualizar'),
    ...apenas('conhecimento', 'visualizar'),
    ...apenas('relatorios', 'visualizar', 'exportar'),
    ...apenas('integracoes', 'visualizar'),
  ],

  /* Parceiro externo. Só o que ele mesmo gerou — o portal roda com este
     papel e o filtro por afiliado é obrigatório no service. */
  afiliado: [
    ...apenas('dashboard', 'visualizar'),
    ...apenas('leads', 'visualizar', 'criar'),
    ...apenas('partners', 'visualizar'),
    ...apenas('comissoes', 'visualizar'),
    ...apenas('conhecimento', 'visualizar'),
  ],

  /* Lê tudo, não escreve nada. Existe para conformidade. */
  auditor: [
    ...MODULOS_OPERACIONAIS.map((m) => `${m}.visualizar` as PermissionKey),
    ...apenas('relatorios', 'exportar'),
    ...apenas('auditoria', 'exportar'),
  ],
};

/** Permissões da área do proprietário da plataforma. */
export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRoleKey, PlatformPermissionKey[]> = {
  veyra_admin: [
    'plataforma.organizacoes',
    'plataforma.planos',
    'plataforma.assinaturas',
    'plataforma.consumo',
    'plataforma.provedores_ia',
    'plataforma.auditoria',
    'plataforma.chaves_api',
    'plataforma.recursos_experimentais',
  ],
  veyra_suporte: ['plataforma.organizacoes', 'plataforma.consumo', 'plataforma.auditoria'],
};

/** Módulo que cada permissão protege — usado para montar o menu. */
export function moduloDaPermissao(permissao: PermissionKey): ModuleKey | null {
  const [modulo] = permissao.split('.');
  return MODULOS_OPERACIONAIS.includes(modulo as ModuleKey) ? (modulo as ModuleKey) : null;
}

export interface PermissionSubject {
  papel: RoleKey;
  permissoesExtras?: PermissionKey[];
  permissoesRevogadas?: PermissionKey[];
  /** Módulos que o plano da organização libera. Vence a permissão do papel. */
  modulosLiberados?: ModuleKey[];
}

/**
 * Decide se o sujeito pode executar a ação.
 *
 * A ordem importa e não é arbitrária:
 *   1. módulo não contratado  → não, mesmo para o administrador;
 *   2. permissão revogada     → não, mesmo que o papel conceda;
 *   3. permissão extra        → sim;
 *   4. matriz do papel        → resposta padrão.
 */
export function podeExecutar(sujeito: PermissionSubject, permissao: PermissionKey): boolean {
  const modulo = moduloDaPermissao(permissao);
  if (modulo && sujeito.modulosLiberados && !sujeito.modulosLiberados.includes(modulo)) {
    return false;
  }
  if (sujeito.permissoesRevogadas?.includes(permissao)) return false;
  if (sujeito.permissoesExtras?.includes(permissao)) return true;
  return ROLE_PERMISSIONS[sujeito.papel].includes(permissao);
}

/** Atalho para o caso mais comum: "esse papel enxerga esse módulo?". */
export function podeVer(sujeito: PermissionSubject, modulo: ModuleKey): boolean {
  return podeExecutar(sujeito, `${modulo}.visualizar` as PermissionKey);
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  administrador: 'Administrador',
  gestor: 'Gestor',
  supervisor: 'Supervisor',
  vendedor: 'Vendedor',
  financeiro: 'Financeiro',
  suporte: 'Suporte',
  marketing: 'Marketing',
  afiliado: 'Afiliado',
  auditor: 'Auditor',
};

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  administrador: 'Dono da conta. Configura a operação inteira dentro da própria empresa.',
  gestor: 'Comanda o comercial de ponta a ponta e lê o financeiro sem alterá-lo.',
  supervisor: 'Responde por uma equipe: distribui, acompanha e aprova.',
  vendedor: 'Atende a própria carteira, do primeiro contato ao contrato.',
  financeiro: 'Cobrança, baixa, fluxo de caixa e comissões.',
  suporte: 'Pós-venda, protocolos e SLA.',
  marketing: 'Campanhas, origem, segmentação e ROI.',
  afiliado: 'Parceiro externo. Vê apenas o que a própria indicação gerou.',
  auditor: 'Leitura total, escrita nenhuma.',
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  visualizar: 'Visualizar',
  criar: 'Criar',
  editar: 'Editar',
  excluir: 'Excluir',
  exportar: 'Exportar',
  aprovar: 'Aprovar',
  cancelar: 'Cancelar',
  transferir: 'Transferir',
};

export { MODULOS_OPERACIONAIS, TODAS_ACOES };
