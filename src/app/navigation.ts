import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, Building2, DoorOpen, UserCheck, Car, Package, CalendarDays,
  Wallet, Wrench, AlertTriangle, Megaphone, FolderOpen, Gavel, HardHat, ShieldCheck,
  Sparkles, ScrollText, Settings, Home, Network, Monitor, ScanLine, KeyRound, Video,
  Receipt, ClipboardList, Bell, UserCog,
} from 'lucide-react';
import type { Permission, User } from '../data/types';
import { can } from '../services/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  end?: boolean;
  badge?: 'notifications' | 'tickets' | 'deliveries' | 'visitors';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const RESIDENT_NAV: NavGroup[] = [
  {
    label: 'Meu dia',
    items: [
      { to: '/app', label: 'Início', icon: Home, end: true },
      { to: '/app/visitantes', label: 'Visitantes', icon: UserCheck, permission: 'visitors.view' },
      { to: '/app/acessos', label: 'Acessos', icon: DoorOpen, permission: 'access.view' },
      { to: '/app/encomendas', label: 'Encomendas', icon: Package, permission: 'deliveries.view', badge: 'deliveries' },
      { to: '/app/notificacoes', label: 'Notificações', icon: Bell, badge: 'notifications' },
    ],
  },
  {
    label: 'Serviços',
    items: [
      { to: '/app/reservas', label: 'Reservas', icon: CalendarDays, permission: 'reservations.view' },
      { to: '/app/financeiro', label: 'Financeiro', icon: Wallet, permission: 'finance.personal' },
      { to: '/app/chamados', label: 'Chamados', icon: Wrench, permission: 'tickets.view' },
      { to: '/app/ocorrencias', label: 'Ocorrências', icon: AlertTriangle, permission: 'incidents.view' },
      { to: '/app/veiculos', label: 'Veículos', icon: Car, permission: 'vehicles.view' },
      { to: '/app/funcionarios', label: 'Funcionários', icon: HardHat, permission: 'staff.view' },
    ],
  },
  {
    label: 'Condomínio',
    items: [
      { to: '/app/comunicados', label: 'Comunicados', icon: Megaphone, permission: 'announcements.view' },
      { to: '/app/documentos', label: 'Documentos', icon: FolderOpen, permission: 'documents.view' },
      { to: '/app/assembleias', label: 'Assembleias', icon: Gavel, permission: 'assemblies.view' },
      { to: '/app/concierge', label: 'NEXOR AI', icon: Sparkles, permission: 'concierge.use' },
    ],
  },
];

const GATE_NAV: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { to: '/portaria', label: 'Console', icon: LayoutDashboard, end: true },
      { to: '/portaria/visitantes', label: 'Visitantes', icon: UserCheck, badge: 'visitors' },
      { to: '/portaria/acessos', label: 'Acessos', icon: DoorOpen },
      { to: '/portaria/placas', label: 'Leitura de placa', icon: ScanLine },
      { to: '/portaria/encomendas', label: 'Encomendas', icon: Package, badge: 'deliveries' },
      { to: '/portaria/moradores', label: 'Moradores', icon: Users },
    ],
  },
  {
    label: 'Segurança',
    items: [
      { to: '/portaria/portoes', label: 'Portões', icon: KeyRound, permission: 'gates.operate' },
      { to: '/portaria/cameras', label: 'Câmeras', icon: Video, permission: 'cameras.view' },
      { to: '/portaria/ocorrencias', label: 'Ocorrências', icon: AlertTriangle },
      { to: '/portaria/monitor', label: 'Modo monitor', icon: Monitor },
    ],
  },
];

const MANAGEMENT_NAV: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [
      { to: '/gestao', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', end: true },
      { to: '/gestao/acessos', label: 'Controle de acesso', icon: DoorOpen, permission: 'access.view' },
      { to: '/gestao/seguranca', label: 'NEXOR Security', icon: ShieldCheck, permission: 'security.view' },
      { to: '/gestao/notificacoes', label: 'Notificações', icon: Bell, badge: 'notifications' },
    ],
  },
  {
    label: 'Pessoas',
    items: [
      { to: '/gestao/moradores', label: 'Moradores', icon: Users, permission: 'residents.view' },
      { to: '/gestao/unidades', label: 'Unidades', icon: Building2, permission: 'units.view' },
      { to: '/gestao/visitantes', label: 'Visitantes', icon: UserCheck, permission: 'visitors.view' },
      { to: '/gestao/veiculos', label: 'Veículos', icon: Car, permission: 'vehicles.view' },
      { to: '/gestao/funcionarios', label: 'Funcionários', icon: HardHat, permission: 'staff.view' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { to: '/gestao/encomendas', label: 'Encomendas', icon: Package, permission: 'deliveries.view' },
      { to: '/gestao/reservas', label: 'Reservas', icon: CalendarDays, permission: 'reservations.view' },
      { to: '/gestao/chamados', label: 'Chamados', icon: Wrench, permission: 'tickets.view', badge: 'tickets' },
      { to: '/gestao/ocorrencias', label: 'Ocorrências', icon: AlertTriangle, permission: 'incidents.view' },
      { to: '/gestao/manutencao', label: 'Manutenção', icon: ClipboardList, permission: 'maintenance.view' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/gestao/financeiro', label: 'Financeiro', icon: Receipt, permission: 'finance.admin' },
      { to: '/gestao/comunicados', label: 'Comunicados', icon: Megaphone, permission: 'announcements.view' },
      { to: '/gestao/documentos', label: 'Documentos', icon: FolderOpen, permission: 'documents.view' },
      { to: '/gestao/assembleias', label: 'Assembleias', icon: Gavel, permission: 'assemblies.view' },
      { to: '/gestao/auditoria', label: 'Auditoria', icon: ScrollText, permission: 'audit.view' },
      { to: '/gestao/concierge', label: 'NEXOR AI', icon: Sparkles, permission: 'concierge.use' },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      { to: '/portfolio', label: 'Portfólio', icon: Network, permission: 'portfolio.view', end: true },
      { to: '/gestao/configuracoes', label: 'Configurações', icon: Settings, permission: 'settings.manage' },
    ],
  },
];

const PORTFOLIO_NAV: NavGroup[] = [
  {
    label: 'Administradora',
    items: [
      { to: '/portfolio', label: 'Portfólio', icon: Network, end: true },
      { to: '/portfolio/indicadores', label: 'Indicadores', icon: LayoutDashboard },
      { to: '/portfolio/condominios', label: 'Condomínios', icon: Building2 },
      { to: '/gestao/concierge', label: 'NEXOR AI', icon: Sparkles, permission: 'concierge.use' },
      { to: '/gestao/auditoria', label: 'Auditoria', icon: ScrollText, permission: 'audit.view' },
      { to: '/gestao/configuracoes', label: 'Configurações', icon: Settings, permission: 'settings.manage' },
    ],
  },
];

export function navigationFor(user: User): NavGroup[] {
  const groups =
    user.role === 'morador' ? RESIDENT_NAV
    : user.role === 'portaria' ? GATE_NAV
    : user.role === 'administradora' ? PORTFOLIO_NAV
    : MANAGEMENT_NAV;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || can(user, item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Barra inferior no mobile — apenas os cinco destinos essenciais. */
export function bottomNavFor(user: User): NavItem[] {
  if (user.role === 'morador') {
    return [
      { to: '/app', label: 'Início', icon: Home, end: true },
      { to: '/app/acessos', label: 'Acessos', icon: DoorOpen },
      { to: '/app/reservas', label: 'Reservas', icon: CalendarDays },
      { to: '/app/encomendas', label: 'Encomendas', icon: Package, badge: 'deliveries' },
      { to: '/app/perfil', label: 'Perfil', icon: UserCog },
    ];
  }
  if (user.role === 'portaria') {
    return [
      { to: '/portaria', label: 'Console', icon: LayoutDashboard, end: true },
      { to: '/portaria/visitantes', label: 'Visitantes', icon: UserCheck },
      { to: '/portaria/placas', label: 'Placa', icon: ScanLine },
      { to: '/portaria/encomendas', label: 'Encomendas', icon: Package },
      { to: '/portaria/portoes', label: 'Portões', icon: KeyRound },
    ];
  }
  if (user.role === 'administradora') {
    return [
      { to: '/portfolio', label: 'Portfólio', icon: Network, end: true },
      { to: '/portfolio/indicadores', label: 'Indicadores', icon: LayoutDashboard },
      { to: '/portfolio/condominios', label: 'Condomínios', icon: Building2 },
      { to: '/gestao/concierge', label: 'NEXOR AI', icon: Sparkles },
      { to: '/app/perfil', label: 'Perfil', icon: UserCog },
    ];
  }
  return [
    { to: '/gestao', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/gestao/acessos', label: 'Acessos', icon: DoorOpen },
    { to: '/gestao/chamados', label: 'Chamados', icon: Wrench, badge: 'tickets' },
    { to: '/gestao/financeiro', label: 'Financeiro', icon: Receipt },
    { to: '/app/perfil', label: 'Perfil', icon: UserCog },
  ];
}

export function homeRouteFor(user: User): string {
  switch (user.role) {
    case 'morador': return '/app';
    case 'portaria': return '/portaria';
    case 'administradora': return '/portfolio';
    default: return '/gestao';
  }
}
