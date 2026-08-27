/* =========================================================
   my Home — Matriz de permissões (RBAC)
   ---------------------------------------------------------
   O papel define o conjunto base; o usuário pode receber
   permissões extras. A UI nunca decide sozinha o que exibir:
   sempre consulta `can()`.

   Este arquivo é compartilhado: a mesma matriz que esconde um
   item de menu no aplicativo bloqueia a rota na API. Interface
   e servidor não podem discordar sobre quem pode o quê — se
   discordassem, esconder o botão viraria a única proteção.
   ========================================================= */

import type { Permission, User, UserRole } from './domain';

const MORADOR: Permission[] = [
  'visitors.view', 'visitors.manage',
  'vehicles.view', 'vehicles.manage',
  'access.view',
  'deliveries.view',
  'reservations.view', 'reservations.manage',
  'finance.personal',
  'tickets.view', 'tickets.manage',
  'incidents.view', 'incidents.manage',
  'announcements.view',
  'documents.view',
  'assemblies.view', 'assemblies.vote',
  'staff.view', 'staff.manage',
  'professionals.view',
  'concierge.use',
];

const PORTARIA: Permission[] = [
  'residents.view', 'units.view',
  'visitors.view', 'visitors.approve',
  'vehicles.view',
  'access.view', 'access.register',
  'gates.operate', 'cameras.view',
  'deliveries.view', 'deliveries.manage',
  'incidents.view', 'incidents.manage',
  'staff.view',
  'security.view',
  'announcements.view',
];

const SINDICO: Permission[] = [
  'dashboard.view',
  'residents.view', 'residents.manage', 'units.view',
  'visitors.view', 'visitors.approve',
  'vehicles.view', 'vehicles.manage',
  'access.view',
  'gates.operate', 'cameras.view',
  'deliveries.view',
  'reservations.view', 'reservations.manage', 'reservations.approve',
  'finance.admin',
  'tickets.view', 'tickets.manage',
  'incidents.view', 'incidents.manage',
  'announcements.view', 'announcements.publish',
  'documents.view', 'documents.manage',
  'assemblies.view', 'assemblies.manage',
  'staff.view', 'staff.manage',
  'professionals.view', 'professionals.manage',
  'maintenance.view', 'maintenance.manage',
  'security.view',
  'audit.view',
  'concierge.use',
];

const ADMINISTRADOR: Permission[] = [
  ...SINDICO,
  'access.register',
  'portfolio.view',
  'settings.manage',
];

const ADMINISTRADORA: Permission[] = [
  'portfolio.view',
  'dashboard.view',
  'residents.view', 'units.view',
  'finance.admin',
  'tickets.view',
  'incidents.view',
  'documents.view',
  'announcements.view', 'announcements.publish',
  'assemblies.view',
  'maintenance.view',
  'professionals.view',
  'audit.view',
  'settings.manage',
  'concierge.use',
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  morador: MORADOR,
  portaria: PORTARIA,
  sindico: SINDICO,
  administrador: ADMINISTRADOR,
  administradora: ADMINISTRADORA,
};

export const ROLE_LABEL: Record<UserRole, string> = {
  morador: 'Morador',
  portaria: 'Portaria',
  sindico: 'Síndico(a)',
  administrador: 'Administrador',
  administradora: 'Administradora',
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  morador: 'Acesso à unidade, visitantes, reservas, financeiro pessoal e serviços.',
  portaria: 'Console operacional de portaria: acessos, encomendas, portões e câmeras.',
  sindico: 'Gestão completa do condomínio, indicadores e governança.',
  administrador: 'Gestão ampla, múltiplos condomínios e configurações da plataforma.',
  administradora: 'Visão consolidada de portfólio e indicadores de todos os condomínios.',
};

export function permissionsFor(user: User): Set<Permission> {
  return new Set([...ROLE_PERMISSIONS[user.role], ...(user.extraPermissions ?? [])]);
}

export function can(user: User | null, permission: Permission): boolean {
  if (!user) return false;
  return permissionsFor(user).has(permission);
}

export function canAny(user: User | null, permissions: Permission[]): boolean {
  if (!user) return false;
  const set = permissionsFor(user);
  return permissions.some((p) => set.has(p));
}
