/* =========================================================
   Superfícies fora da área da equipe: Master Norty, portal do
   cliente e site público. As páginas vivem em modules/master,
   modules/portal e modules/site.
   ========================================================= */
import {
  Activity, Bell, Building2, CreditCard, FileText, FolderOpen, Globe, History, Home, Layers, LayoutDashboard, LifeBuoy, MessagesSquare,
  Plug, ReceiptText, Settings, ShieldCheck, TriangleAlert, ClipboardCheck, UserRound,
} from 'lucide-react';
import { SimpleShell, type SimpleNavItem } from '../layouts/SimpleShell';
import { useSession } from '../lib/session';
import { SiteApp } from '../modules/site/SiteApp';

const MASTER_NAV: (SimpleNavItem & { permission?: string })[] = [
  { path: '/master', label: 'Visão geral', icon: LayoutDashboard, end: true, permission: 'platform.orgs.view' },
  { path: '/master/empresas', label: 'Empresas', icon: Building2, permission: 'platform.orgs.view' },
  { path: '/master/planos', label: 'Planos', icon: Layers, permission: 'platform.orgs.view' },
  { path: '/master/assinaturas', label: 'Assinaturas', icon: CreditCard, permission: 'platform.billing.manage' },
  { path: '/master/dominios', label: 'Domínios', icon: Globe, permission: 'platform.domains.manage' },
  { path: '/master/suporte', label: 'Suporte', icon: LifeBuoy, permission: 'platform.support' },
  { path: '/master/saude', label: 'Saúde', icon: Activity, permission: 'platform.health.view' },
  { path: '/master/auditoria', label: 'Auditoria', icon: History, permission: 'platform.audit.view' },
  { path: '/master/equipe', label: 'Equipe Norty', icon: ShieldCheck, permission: 'platform.staff.manage' },
  { path: '/master/integracoes', label: 'Integrações', icon: Plug, permission: 'platform.integrations.manage' },
  { path: '/master/configuracoes', label: 'Configurações', icon: Settings, permission: 'platform.settings.manage' },
];

const PORTAL_NAV: SimpleNavItem[] = [
  { path: '/cliente', label: 'Início', icon: Home, end: true },
  { path: '/cliente/contratos', label: 'Contratos', icon: FileText },
  { path: '/cliente/financeiro', label: 'Financeiro', icon: ReceiptText },
  { path: '/cliente/solicitacoes', label: 'Solicitações', icon: MessagesSquare },
  { path: '/cliente/perfil', label: 'Perfil', icon: UserRound },
  { path: '/cliente/vistorias', label: 'Vistorias', icon: ClipboardCheck },
  { path: '/cliente/multas', label: 'Multas', icon: TriangleAlert },
  { path: '/cliente/documentos', label: 'Documentos', icon: FolderOpen },
  { path: '/cliente/notificacoes', label: 'Notificações', icon: Bell },
];

export function MasterLayout() {
  const { can } = useSession();
  return <SimpleShell items={MASTER_NAV.filter((i) => !i.permission || can(i.permission))} subtitle="Master Norty" profilePath="/master/perfil" />;
}

export function PortalLayout() {
  const { session } = useSession();
  return (
    <SimpleShell items={PORTAL_NAV} subtitle="Portal do cliente" title={session?.context.organizationName ?? 'Portal do cliente'}
      profilePath="/cliente/perfil" notificationsPath="/cliente/notificacoes" />
  );
}

/** Hosts que servem o aplicativo; os demais são sites públicos de locadoras. */
export function isPublicSiteHost(): boolean {
  const hosts = (import.meta.env.VITE_APP_HOSTS ?? 'localhost,127.0.0.1').split(',').map((h: string) => h.trim()).filter(Boolean);
  const host = window.location.hostname;
  // "*.exemplo.com" vale para qualquer subdomínio (túnel com endereço sorteado).
  return !hosts.some((h: string) => (h.startsWith('*.') ? host.endsWith(h.slice(1)) : h === host));
}

/** Site público: em /site/:slug dentro do app, ou na raiz de um domínio próprio. */
export function PublicSiteRoot() {
  return <SiteApp />;
}
