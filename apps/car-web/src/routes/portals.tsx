import type { AppRoute } from './types';
import { ProfilePage } from '../modules/shared/ProfilePage';
import { MasterDashboard } from '../modules/master/MasterDashboard';
import { OrganizationsPage } from '../modules/master/OrganizationsPage';
import { OrganizationDetail } from '../modules/master/OrganizationDetail';
import {
  HealthPage, MasterAuditPage, MasterDomainsPage, MasterIntegrationsPage, MasterSettingsPage, MasterSupportPage, PlansPage, StaffPage,
  SubscriptionsPage,
} from '../modules/master/MasterPages';
import {
  PortalContractDetailPage, PortalContracts, PortalDocuments, PortalFinance, PortalHome, PortalInfractions, PortalInspections, PortalNotifications,
  PortalRequests,
} from '../modules/portal/PortalPages';
import { LeadsPage } from '../modules/site-admin/LeadsPage';
import { ServiceRequestsPage } from '../modules/site-admin/ServiceRequestsPage';
import { SiteAdminPage } from '../modules/site-admin/SiteAdminPage';
import { DomainsPage } from '../modules/site-admin/DomainsPage';
import { IntegrationsPage } from '../modules/site-admin/IntegrationsPage';

/**
 * Rotas do Master Norty (contexto PLATFORM), relativas a /master. As
 * permissões aqui são de plataforma; o Guard compara com a sessão.
 */
export const MASTER_ROUTES: AppRoute[] = [
  { path: '/master', element: <MasterDashboard />, permissions: ['platform.orgs.view' as never] },
  { path: '/master/empresas', element: <OrganizationsPage />, permissions: ['platform.orgs.view' as never] },
  { path: '/master/empresas/:id', element: <OrganizationDetail />, permissions: ['platform.orgs.view' as never] },
  { path: '/master/planos', element: <PlansPage />, permissions: ['platform.orgs.view' as never] },
  { path: '/master/assinaturas', element: <SubscriptionsPage />, permissions: ['platform.billing.manage' as never] },
  { path: '/master/dominios', element: <MasterDomainsPage />, permissions: ['platform.domains.manage' as never] },
  { path: '/master/suporte', element: <MasterSupportPage />, permissions: ['platform.support' as never] },
  { path: '/master/saude', element: <HealthPage />, permissions: ['platform.health.view' as never] },
  { path: '/master/auditoria', element: <MasterAuditPage />, permissions: ['platform.audit.view' as never] },
  { path: '/master/equipe', element: <StaffPage />, permissions: ['platform.staff.manage' as never] },
  { path: '/master/integracoes', element: <MasterIntegrationsPage />, permissions: ['platform.integrations.manage' as never] },
  { path: '/master/configuracoes', element: <MasterSettingsPage />, permissions: ['platform.settings.manage' as never] },
  { path: '/master/perfil', element: <ProfilePage /> },
];

/** Rotas do portal do cliente (contexto CUSTOMER), relativas a /cliente. */
export const PORTAL_ROUTES: AppRoute[] = [
  { path: '/cliente', element: <PortalHome /> },
  { path: '/cliente/contratos', element: <PortalContracts /> },
  { path: '/cliente/contratos/:id', element: <PortalContractDetailPage /> },
  { path: '/cliente/financeiro', element: <PortalFinance /> },
  { path: '/cliente/documentos', element: <PortalDocuments /> },
  { path: '/cliente/vistorias', element: <PortalInspections /> },
  { path: '/cliente/multas', element: <PortalInfractions /> },
  { path: '/cliente/solicitacoes', element: <PortalRequests /> },
  { path: '/cliente/notificacoes', element: <PortalNotifications /> },
  { path: '/cliente/perfil', element: <ProfilePage /> },
];

/** Rotas da equipe vindas deste grupo (site, domínios, pedidos do site, portal, integrações). */
export const PORTALS_STAFF_ROUTES: AppRoute[] = [
  { path: '/locacoes/pedidos-site', element: <LeadsPage />, permissions: ['leads.manage'] },
  { path: '/pessoas/solicitacoes', element: <ServiceRequestsPage />, permissions: ['portal.manage'] },
  { path: '/admin/site', element: <SiteAdminPage />, permissions: ['site.manage'] },
  { path: '/admin/dominios', element: <DomainsPage />, permissions: ['domains.manage'] },
  { path: '/admin/integracoes', element: <IntegrationsPage />, permissions: ['integrations.manage'] },
];
