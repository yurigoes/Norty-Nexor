/* =========================================================
   Norty Car — Permissões granulares, módulos e perfis
   ---------------------------------------------------------
   A mesma lista monta o menu do aplicativo e alimenta o
   PermissionsGuard da API. Esconder um item é conveniência;
   o guard é a proteção.

   Três camadas compõem o que um usuário pode fazer:
     1. o perfil (Role) dá um conjunto de permissões;
     2. o plano da empresa habilita módulos;
     3. permissão de módulo desabilitado é descartada.
   A seleção de loja nunca acrescenta permissão: ela só
   restringe as filiais visíveis.
   ========================================================= */

import type { PlatformRole } from './domain';

export type ModuleKey =
  | 'core' | 'fleet' | 'rentals' | 'finance' | 'inspections' | 'inventory' | 'maintenance'
  | 'infractions' | 'claims' | 'refuel' | 'sales' | 'site' | 'portal' | 'reports' | 'ai' | 'api';

export const MODULE_LABEL: Record<ModuleKey, string> = {
  core: 'Núcleo (empresa, usuários, auditoria)',
  fleet: 'Frota',
  rentals: 'Reservas e contratos',
  finance: 'Financeiro',
  inspections: 'Vistorias',
  inventory: 'Estoque e compras',
  maintenance: 'Manutenção e pneus',
  infractions: 'Infrações',
  claims: 'Sinistros e seguros',
  refuel: 'Abastecimentos',
  sales: 'Compra e venda',
  site: 'Site público e domínios',
  portal: 'Portal do cliente',
  reports: 'Relatórios',
  ai: 'Norty IA',
  api: 'API de integração',
};

/** Módulos que nunca podem ser desligados: sem eles a empresa não opera. */
export const ALWAYS_ON_MODULES: ModuleKey[] = ['core', 'fleet', 'rentals'];

interface PermissionDef {
  label: string;
  module: ModuleKey;
  group: string;
}

/**
 * Catálogo completo. A chave é a permissão; `module` liga ao plano e
 * `group` organiza a tela de perfis.
 */
export const PERMISSIONS = {
  'dashboard.view': { label: 'Ver dashboard', module: 'core', group: 'Visão geral' },
  'notifications.view': { label: 'Ver notificações', module: 'core', group: 'Visão geral' },

  'fleet.view': { label: 'Visualizar veículos', module: 'fleet', group: 'Frota' },
  'fleet.create': { label: 'Cadastrar veículos', module: 'fleet', group: 'Frota' },
  'fleet.edit': { label: 'Editar veículos', module: 'fleet', group: 'Frota' },
  'fleet.delete': { label: 'Excluir logicamente veículos', module: 'fleet', group: 'Frota' },
  'fleet.status': { label: 'Alterar situação do veículo', module: 'fleet', group: 'Frota' },
  'fleet.unblock': { label: 'Liberar veículo bloqueado', module: 'fleet', group: 'Frota' },
  'fleet.documents': { label: 'Gerenciar documentos de veículos', module: 'fleet', group: 'Frota' },
  'fleet.financials': { label: 'Ver valores patrimoniais da frota', module: 'fleet', group: 'Frota' },
  'catalog.manage': { label: 'Gerenciar catálogo de modelos', module: 'fleet', group: 'Frota' },
  'pricing.manage': { label: 'Gerenciar tarifas e regras comerciais', module: 'rentals', group: 'Frota' },

  'customers.view': { label: 'Visualizar clientes', module: 'core', group: 'Pessoas' },
  'customers.create': { label: 'Cadastrar clientes e motoristas', module: 'core', group: 'Pessoas' },
  'customers.edit': { label: 'Editar clientes e motoristas', module: 'core', group: 'Pessoas' },
  'customers.delete': { label: 'Excluir ou anonimizar clientes', module: 'core', group: 'Pessoas' },
  'customers.sensitive': { label: 'Ver documentos pessoais completos', module: 'core', group: 'Pessoas' },
  'customers.block': { label: 'Bloquear e desbloquear clientes', module: 'core', group: 'Pessoas' },

  'reservations.view': { label: 'Visualizar reservas', module: 'rentals', group: 'Locações' },
  'reservations.create': { label: 'Criar reservas e cotações', module: 'rentals', group: 'Locações' },
  'reservations.confirm': { label: 'Confirmar reservas', module: 'rentals', group: 'Locações' },
  'reservations.cancel': { label: 'Cancelar reservas', module: 'rentals', group: 'Locações' },
  'contracts.view': { label: 'Visualizar contratos', module: 'rentals', group: 'Locações' },
  'contracts.create': { label: 'Criar contratos', module: 'rentals', group: 'Locações' },
  'contracts.edit': { label: 'Alterar contratos (aditivos, trocas)', module: 'rentals', group: 'Locações' },
  'contracts.approve': { label: 'Aprovar contratos', module: 'rentals', group: 'Locações' },
  'contracts.price_override': { label: 'Alterar valores negociados', module: 'rentals', group: 'Locações' },
  'contracts.close': { label: 'Encerrar e rescindir contratos', module: 'rentals', group: 'Locações' },

  'deposits.view': { label: 'Visualizar cauções', module: 'finance', group: 'Financeiro' },
  'deposits.manage': { label: 'Registrar movimentos de caução', module: 'finance', group: 'Financeiro' },
  'deposits.approve': { label: 'Aprovar utilização e devolução de caução', module: 'finance', group: 'Financeiro' },
  'finance.view': { label: 'Visualizar financeiro', module: 'finance', group: 'Financeiro' },
  'finance.receivables': { label: 'Gerenciar contas a receber', module: 'finance', group: 'Financeiro' },
  'finance.payables': { label: 'Gerenciar contas a pagar', module: 'finance', group: 'Financeiro' },
  'finance.settle': { label: 'Dar baixa em pagamentos', module: 'finance', group: 'Financeiro' },
  'finance.approve': { label: 'Aprovar despesas e pagamentos', module: 'finance', group: 'Financeiro' },
  'finance.reconcile': { label: 'Conciliar lançamentos', module: 'finance', group: 'Financeiro' },

  'inspections.view': { label: 'Visualizar vistorias', module: 'inspections', group: 'Operação' },
  'inspections.perform': { label: 'Registrar vistorias', module: 'inspections', group: 'Operação' },
  'inspections.approve': { label: 'Aprovar vistorias', module: 'inspections', group: 'Operação' },
  'inventory.view': { label: 'Visualizar estoque', module: 'inventory', group: 'Operação' },
  'inventory.manage': { label: 'Cadastrar produtos e locais', module: 'inventory', group: 'Operação' },
  'inventory.move': { label: 'Movimentar estoque', module: 'inventory', group: 'Operação' },
  'inventory.adjust': { label: 'Ajustar inventário e baixar perdas', module: 'inventory', group: 'Operação' },
  'purchases.manage': { label: 'Criar pedidos de compra', module: 'inventory', group: 'Operação' },
  'purchases.approve': { label: 'Autorizar compras', module: 'inventory', group: 'Operação' },
  'maintenance.view': { label: 'Visualizar manutenção', module: 'maintenance', group: 'Operação' },
  'maintenance.manage': { label: 'Abrir e executar ordens de serviço', module: 'maintenance', group: 'Operação' },
  'maintenance.approve': { label: 'Aprovar orçamentos de OS', module: 'maintenance', group: 'Operação' },
  'maintenance.release': { label: 'Liberar veículo após OS', module: 'maintenance', group: 'Operação' },
  'refuel.view': { label: 'Visualizar abastecimentos', module: 'refuel', group: 'Operação' },
  'refuel.manage': { label: 'Registrar abastecimentos', module: 'refuel', group: 'Operação' },

  'infractions.view': { label: 'Visualizar infrações', module: 'infractions', group: 'Regularização' },
  'infractions.manage': { label: 'Gerenciar infrações', module: 'infractions', group: 'Regularização' },
  'infractions.indicate_driver': { label: 'Indicar condutor', module: 'infractions', group: 'Regularização' },
  'claims.view': { label: 'Visualizar sinistros e seguros', module: 'claims', group: 'Regularização' },
  'claims.manage': { label: 'Gerenciar sinistros e seguros', module: 'claims', group: 'Regularização' },

  'sales.view': { label: 'Visualizar venda de frota', module: 'sales', group: 'Frota' },
  'sales.manage': { label: 'Gerenciar anúncios e propostas', module: 'sales', group: 'Frota' },
  'sales.close': { label: 'Concluir venda e baixa patrimonial', module: 'sales', group: 'Frota' },

  'reports.view': { label: 'Ver relatórios operacionais', module: 'reports', group: 'Relatórios' },
  'reports.financial': { label: 'Acessar relatórios financeiros', module: 'reports', group: 'Relatórios' },
  'reports.export': { label: 'Exportar relatórios', module: 'reports', group: 'Relatórios' },

  'audit.view': { label: 'Ver trilha de auditoria', module: 'core', group: 'Administração' },
  'users.manage': { label: 'Administrar usuários', module: 'core', group: 'Administração' },
  'roles.manage': { label: 'Administrar perfis e permissões', module: 'core', group: 'Administração' },
  'branches.manage': { label: 'Administrar filiais', module: 'core', group: 'Administração' },
  'settings.manage': { label: 'Alterar configurações da empresa', module: 'core', group: 'Administração' },
  'domains.manage': { label: 'Gerenciar domínios', module: 'site', group: 'Administração' },
  'site.manage': { label: 'Personalizar o site público', module: 'site', group: 'Administração' },
  'leads.manage': { label: 'Atender orçamentos e contatos do site', module: 'site', group: 'Locações' },
  'portal.manage': { label: 'Atender solicitações do portal do cliente', module: 'portal', group: 'Pessoas' },
  'integrations.manage': { label: 'Gerenciar integrações e chaves de API', module: 'api', group: 'Administração' },
  'support.approve': { label: 'Autorizar acesso do suporte Norty', module: 'core', group: 'Administração' },
  'ai.use': { label: 'Usar a Norty IA', module: 'ai', group: 'Visão geral' },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/* ---------------- Plataforma (Master Norty) ---------------- */

export const PLATFORM_PERMISSIONS = {
  'platform.orgs.view': 'Ver empresas',
  'platform.orgs.manage': 'Cadastrar, suspender e reativar empresas',
  'platform.plans.manage': 'Gerenciar planos e módulos',
  'platform.billing.manage': 'Gerenciar assinaturas e faturas do SaaS',
  'platform.domains.manage': 'Gerenciar domínios',
  'platform.health.view': 'Monitorar saúde e filas',
  'platform.audit.view': 'Ver auditoria administrativa',
  'platform.support': 'Atender suporte e solicitar acesso excepcional',
  'platform.settings.manage': 'Alterar configurações globais',
  'platform.staff.manage': 'Administrar equipe Norty',
  'platform.integrations.manage': 'Gerenciar integrações globais',
} as const;
export type PlatformPermission = keyof typeof PLATFORM_PERMISSIONS;

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  NONE: [],
  SUPPORT: ['platform.orgs.view', 'platform.support', 'platform.health.view', 'platform.domains.manage'],
  ADMIN: [
    'platform.orgs.view', 'platform.orgs.manage', 'platform.plans.manage', 'platform.billing.manage',
    'platform.domains.manage', 'platform.health.view', 'platform.audit.view', 'platform.support',
    'platform.integrations.manage',
  ],
  SUPER: Object.keys(PLATFORM_PERMISSIONS) as PlatformPermission[],
};

/** Permissões que o suporte pode receber num acesso excepcional: só leitura. */
export const SUPPORT_GRANTABLE: Permission[] = ALL_PERMISSIONS.filter(
  (p) => p.endsWith('.view') || p === 'reports.view',
);

/* ---------------- Perfis-modelo da empresa ---------------- */

export type RoleTemplateKey =
  | 'owner' | 'admin' | 'regional_manager' | 'branch_manager' | 'rental_agent' | 'finance'
  | 'inspector' | 'mechanic' | 'storekeeper' | 'auditor' | 'viewer';

const VIEW_ALL = ALL_PERMISSIONS.filter((p) => p.endsWith('.view'));
const without = (list: Permission[], drop: Permission[]) => list.filter((p) => !drop.includes(p));

const OPERATIONS: Permission[] = [
  'dashboard.view', 'notifications.view',
  'fleet.view', 'fleet.create', 'fleet.edit', 'fleet.status', 'fleet.documents',
  'customers.view', 'customers.create', 'customers.edit', 'customers.block',
  'reservations.view', 'reservations.create', 'reservations.confirm', 'reservations.cancel',
  'contracts.view', 'contracts.create', 'contracts.edit', 'contracts.close',
  'deposits.view', 'deposits.manage',
  'inspections.view', 'inspections.perform', 'inspections.approve',
  'maintenance.view', 'maintenance.manage', 'maintenance.release',
  'inventory.view', 'inventory.move',
  'refuel.view', 'refuel.manage',
  'infractions.view', 'infractions.manage',
  'claims.view', 'claims.manage',
  'sales.view',
  'leads.manage', 'portal.manage',
  'reports.view', 'reports.export',
  'ai.use',
];

export const ROLE_TEMPLATES: Record<RoleTemplateKey, { name: string; description: string; permissions: Permission[] }> = {
  owner: {
    name: 'Proprietário',
    description: 'Controle total da empresa e visão consolidada de todas as filiais.',
    permissions: ALL_PERMISSIONS,
  },
  admin: {
    name: 'Administrador',
    description: 'Administra usuários, filiais, configurações e todos os módulos.',
    permissions: without(ALL_PERMISSIONS, ['support.approve']),
  },
  regional_manager: {
    name: 'Gerente regional',
    description: 'Opera e aprova nas filiais da sua região.',
    permissions: [
      ...OPERATIONS, 'contracts.approve', 'contracts.price_override', 'deposits.approve',
      'finance.view', 'finance.approve', 'reports.financial', 'maintenance.approve',
      'purchases.approve', 'sales.manage', 'fleet.unblock', 'fleet.financials', 'pricing.manage',
      'infractions.indicate_driver', 'audit.view',
    ],
  },
  branch_manager: {
    name: 'Gerente de loja',
    description: 'Opera a loja e aprova dentro do seu limite.',
    permissions: [
      ...OPERATIONS, 'contracts.approve', 'deposits.approve', 'finance.view',
      'maintenance.approve', 'purchases.manage', 'fleet.unblock', 'infractions.indicate_driver',
    ],
  },
  rental_agent: {
    name: 'Atendente de locação',
    description: 'Atende clientes, cria reservas, contratos, retiradas e devoluções.',
    permissions: [
      'dashboard.view', 'notifications.view', 'fleet.view', 'customers.view', 'customers.create',
      'customers.edit', 'reservations.view', 'reservations.create', 'reservations.confirm',
      'reservations.cancel', 'contracts.view', 'contracts.create', 'contracts.edit', 'deposits.view',
      'deposits.manage', 'inspections.view', 'inspections.perform', 'leads.manage', 'portal.manage',
      'refuel.view', 'refuel.manage',
    ],
  },
  finance: {
    name: 'Financeiro',
    description: 'Contas a receber e a pagar, baixas, conciliação e cauções.',
    permissions: [
      'dashboard.view', 'notifications.view', 'fleet.view', 'fleet.financials', 'customers.view',
      'contracts.view', 'reservations.view', 'deposits.view', 'deposits.manage', 'deposits.approve',
      'finance.view', 'finance.receivables', 'finance.payables', 'finance.settle', 'finance.approve',
      'finance.reconcile', 'infractions.view', 'infractions.manage', 'claims.view', 'sales.view',
      'reports.view', 'reports.financial', 'reports.export', 'purchases.approve',
    ],
  },
  inspector: {
    name: 'Vistoriador',
    description: 'Realiza vistorias com fotos no pátio.',
    permissions: [
      'notifications.view', 'fleet.view', 'customers.view', 'contracts.view', 'reservations.view',
      'inspections.view', 'inspections.perform', 'refuel.view', 'refuel.manage',
    ],
  },
  mechanic: {
    name: 'Mecânico',
    description: 'Executa ordens de serviço e consome peças do estoque.',
    permissions: [
      'notifications.view', 'fleet.view', 'maintenance.view', 'maintenance.manage', 'inventory.view',
      'inventory.move', 'inspections.view',
    ],
  },
  storekeeper: {
    name: 'Almoxarife',
    description: 'Controla produtos, locais, movimentações, inventário e recebimentos.',
    permissions: [
      'notifications.view', 'fleet.view', 'inventory.view', 'inventory.manage', 'inventory.move',
      'inventory.adjust', 'purchases.manage', 'maintenance.view',
    ],
  },
  auditor: {
    name: 'Auditor',
    description: 'Consulta tudo, inclusive a trilha de auditoria, sem alterar nada.',
    permissions: [...VIEW_ALL, 'reports.financial', 'reports.export', 'fleet.financials'],
  },
  viewer: {
    name: 'Usuário de consulta',
    description: 'Consulta operacional sem acesso a valores financeiros.',
    permissions: without(VIEW_ALL, ['finance.view', 'deposits.view', 'audit.view']),
  },
};

/* ---------------- Permissões efetivas ---------------- */

/**
 * Permissões que valem de fato: as do perfil, menos as de módulos que o
 * plano da empresa não habilita.
 */
export function effectivePermissions(rolePermissions: readonly string[], enabledModules: readonly string[]): Permission[] {
  const modules = new Set<string>([...enabledModules, ...ALWAYS_ON_MODULES]);
  return rolePermissions.filter(
    (p): p is Permission => isPermission(p) && modules.has(PERMISSIONS[p].module),
  );
}

export function hasPermission(granted: readonly string[] | Set<string>, permission: Permission): boolean {
  return granted instanceof Set ? granted.has(permission) : granted.includes(permission);
}

export function hasAny(granted: readonly string[] | Set<string>, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(granted, p));
}

/** Permissões fixas do portal do cliente — o cliente só vê o que é dele. */
export const CUSTOMER_PORTAL_SCOPES = [
  'portal.contracts', 'portal.finance', 'portal.documents', 'portal.requests', 'portal.inspections',
] as const;
