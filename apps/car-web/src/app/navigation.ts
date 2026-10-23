/* =========================================================
   Navegação da equipe da locadora, agrupada por domínio.
   Um item só aparece se (1) o usuário tem ao menos uma das
   permissões, (2) o plano habilita o módulo e (3) a rota
   existe no registro. A API valida tudo de novo.
   ========================================================= */
import type { LucideIcon } from 'lucide-react';
import {
  Bell, Building2, CalendarClock, CalendarRange, Car, CarFront, ClipboardCheck, ClipboardList, Coins, FileBarChart,
  FileWarning, Fuel, Gauge, Globe, History, KeyRound, Landmark, LayoutDashboard, LifeBuoy, Link2, Boxes,
  ReceiptText, Repeat, ScrollText, Settings, Shield, ShieldAlert, ShoppingCart, Sparkles, Tag, TrendingUp, Undo2,
  Users, UserSquare, Wallet, Wrench, CircleDot, FolderClock, Inbox, Handshake, MessagesSquare, BadgeDollarSign,
} from 'lucide-react';
import type { ModuleKey, Permission } from '@nortycar/shared';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  permissions: Permission[];
  module?: ModuleKey;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const STAFF_NAV: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [
      { path: '/painel', label: 'Dashboard', icon: LayoutDashboard, permissions: ['dashboard.view'] },
      { path: '/notificacoes', label: 'Notificações', icon: Bell, permissions: ['notifications.view'] },
      { path: '/agenda', label: 'Agenda', icon: CalendarClock, permissions: ['reservations.view', 'contracts.view'] },
      { path: '/ia', label: 'Norty IA', icon: Sparkles, permissions: ['ai.use'], module: 'ai' },
    ],
  },
  {
    label: 'Frota',
    items: [
      { path: '/frota/veiculos', label: 'Veículos', icon: Car, permissions: ['fleet.view'], module: 'fleet' },
      { path: '/frota/modelos', label: 'Modelos', icon: CarFront, permissions: ['fleet.view'], module: 'fleet' },
      { path: '/frota/disponibilidade', label: 'Disponibilidade', icon: CalendarRange, permissions: ['fleet.view', 'reservations.view'], module: 'fleet' },
      { path: '/frota/historico', label: 'Histórico por placa', icon: History, permissions: ['fleet.view'], module: 'fleet' },
      { path: '/frota/venda', label: 'Compra e venda', icon: Tag, permissions: ['sales.view'], module: 'sales' },
    ],
  },
  {
    label: 'Locações',
    items: [
      { path: '/locacoes/reservas', label: 'Reservas', icon: CalendarClock, permissions: ['reservations.view'], module: 'rentals' },
      { path: '/locacoes/contratos', label: 'Contratos', icon: ScrollText, permissions: ['contracts.view'], module: 'rentals' },
      { path: '/locacoes/retiradas', label: 'Retiradas', icon: KeyRound, permissions: ['contracts.view'], module: 'rentals' },
      { path: '/locacoes/devolucoes', label: 'Devoluções', icon: Undo2, permissions: ['contracts.view'], module: 'rentals' },
      { path: '/locacoes/renovacoes', label: 'Renovações', icon: Repeat, permissions: ['contracts.view'], module: 'rentals' },
      { path: '/locacoes/tarifas', label: 'Tarifas', icon: BadgeDollarSign, permissions: ['pricing.manage', 'reservations.view'], module: 'rentals' },
      { path: '/locacoes/pedidos-site', label: 'Pedidos do site', icon: Inbox, permissions: ['leads.manage'], module: 'site' },
    ],
  },
  {
    label: 'Pessoas',
    items: [
      { path: '/pessoas/clientes', label: 'Clientes', icon: Users, permissions: ['customers.view'] },
      { path: '/pessoas/motoristas', label: 'Motoristas', icon: UserSquare, permissions: ['customers.view'] },
      { path: '/pessoas/solicitacoes', label: 'Solicitações do portal', icon: MessagesSquare, permissions: ['portal.manage'], module: 'portal' },
    ],
  },
  {
    label: 'Operação',
    items: [
      { path: '/operacao/vistorias', label: 'Vistorias', icon: ClipboardCheck, permissions: ['inspections.view'], module: 'inspections' },
      { path: '/operacao/ordens-servico', label: 'Ordens de serviço', icon: Wrench, permissions: ['maintenance.view'], module: 'maintenance' },
      { path: '/operacao/manutencao', label: 'Manutenção preventiva', icon: Gauge, permissions: ['maintenance.view'], module: 'maintenance' },
      { path: '/operacao/estoque', label: 'Estoque', icon: Boxes, permissions: ['inventory.view'], module: 'inventory' },
      { path: '/operacao/compras', label: 'Compras', icon: ShoppingCart, permissions: ['inventory.view', 'purchases.manage'], module: 'inventory' },
      { path: '/operacao/pneus', label: 'Pneus', icon: CircleDot, permissions: ['maintenance.view'], module: 'maintenance' },
      { path: '/operacao/abastecimentos', label: 'Abastecimentos', icon: Fuel, permissions: ['refuel.view'], module: 'refuel' },
    ],
  },
  {
    label: 'Regularização',
    items: [
      { path: '/regularizacao/infracoes', label: 'Infrações', icon: FileWarning, permissions: ['infractions.view'], module: 'infractions' },
      { path: '/regularizacao/sinistros', label: 'Sinistros', icon: ShieldAlert, permissions: ['claims.view'], module: 'claims' },
      { path: '/regularizacao/seguros', label: 'Seguros', icon: Shield, permissions: ['claims.view'], module: 'claims' },
      { path: '/regularizacao/documentos', label: 'Documentos a vencer', icon: FolderClock, permissions: ['fleet.view', 'customers.view'] },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { path: '/financeiro', label: 'Receitas e caixa', icon: TrendingUp, permissions: ['finance.view'], module: 'finance' },
      { path: '/financeiro/receber', label: 'Contas a receber', icon: ReceiptText, permissions: ['finance.view'], module: 'finance' },
      { path: '/financeiro/pagar', label: 'Contas a pagar', icon: Wallet, permissions: ['finance.view'], module: 'finance' },
      { path: '/financeiro/caucoes', label: 'Cauções', icon: Landmark, permissions: ['deposits.view'], module: 'finance' },
      { path: '/financeiro/conciliacao', label: 'Conciliação', icon: Coins, permissions: ['finance.reconcile'], module: 'finance' },
      { path: '/financeiro/fornecedores', label: 'Fornecedores', icon: Handshake, permissions: ['finance.payables', 'inventory.manage', 'purchases.manage'] },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { path: '/relatorios', label: 'Relatórios', icon: FileBarChart, permissions: ['reports.view'], module: 'reports' },
      { path: '/relatorios/rentabilidade', label: 'Rentabilidade', icon: TrendingUp, permissions: ['reports.financial'], module: 'reports' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { path: '/admin/usuarios', label: 'Usuários', icon: Users, permissions: ['users.manage'] },
      { path: '/admin/perfis', label: 'Permissões', icon: KeyRound, permissions: ['roles.manage'] },
      { path: '/admin/filiais', label: 'Filiais', icon: Building2, permissions: ['branches.manage'] },
      { path: '/admin/site', label: 'Site público', icon: Globe, permissions: ['site.manage'], module: 'site' },
      { path: '/admin/dominios', label: 'Domínios', icon: Link2, permissions: ['domains.manage'], module: 'site' },
      { path: '/admin/integracoes', label: 'Integrações', icon: ClipboardList, permissions: ['integrations.manage'] },
      { path: '/admin/configuracoes', label: 'Configurações', icon: Settings, permissions: ['settings.manage'] },
      { path: '/admin/auditoria', label: 'Auditoria', icon: History, permissions: ['audit.view'] },
      { path: '/admin/suporte', label: 'Suporte Norty', icon: LifeBuoy, permissions: ['support.approve', 'settings.manage'] },
    ],
  },
];

export const ALL_STAFF_ITEMS = STAFF_NAV.flatMap((g) => g.items);
