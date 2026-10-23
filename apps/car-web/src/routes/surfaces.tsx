/* =========================================================
   Superfícies fora da área da equipe: Master Norty, portal do
   cliente e site público. Os layouts e páginas definitivos
   vivem nos módulos `master`, `portal` e `site`.
   ========================================================= */
import { Building2, FileText, Home, LayoutDashboard, UserRound } from 'lucide-react';
import { SimpleShell, type SimpleNavItem } from '../layouts/SimpleShell';
import { EmptyState } from '../components/ui';

const MASTER_NAV: SimpleNavItem[] = [
  { path: '/master', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { path: '/master/empresas', label: 'Empresas', icon: Building2 },
];

const PORTAL_NAV: SimpleNavItem[] = [
  { path: '/cliente', label: 'Início', icon: Home, end: true },
  { path: '/cliente/contratos', label: 'Contratos', icon: FileText },
  { path: '/cliente/perfil', label: 'Perfil', icon: UserRound },
];

export function MasterLayout() {
  return <SimpleShell items={MASTER_NAV} subtitle="Master Norty" profilePath="/master/perfil" />;
}

export function PortalLayout() {
  return <SimpleShell items={PORTAL_NAV} subtitle="Portal do cliente" profilePath="/cliente/perfil" notificationsPath="/cliente" />;
}

/** Hosts que servem o aplicativo; os demais são sites públicos de locadoras. */
export function isPublicSiteHost(): boolean {
  const hosts = (import.meta.env.VITE_APP_HOSTS ?? 'localhost,127.0.0.1').split(',').map((h: string) => h.trim()).filter(Boolean);
  return !hosts.includes(window.location.hostname);
}

export function PublicSiteRoot() {
  return <EmptyState title="Site da locadora" description="Carregando…" />;
}
