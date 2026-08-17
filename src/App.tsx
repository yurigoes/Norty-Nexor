import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from './app/SessionContext';
import { ToastProvider } from './components/ui';
import { AppShell } from './layouts/AppShell';
import { homeRouteFor } from './app/navigation';
import type { Permission } from './data/types';

import { LoginPage } from './modules/auth/LoginPage';

import { ResidentHome } from './modules/resident/ResidentHome';
import { ResidentVisitors } from './modules/resident/ResidentVisitors';
import { ResidentAccess } from './modules/resident/ResidentAccess';
import { ResidentDeliveries } from './modules/resident/ResidentDeliveries';
import { ResidentReservations } from './modules/resident/ResidentReservations';
import { ResidentFinance } from './modules/resident/ResidentFinance';
import { ResidentTickets } from './modules/resident/ResidentTickets';
import { ResidentIncidents } from './modules/resident/ResidentIncidents';
import { ResidentVehicles } from './modules/resident/ResidentVehicles';
import { ResidentStaff } from './modules/resident/ResidentStaff';
import { NotificationsPage } from './modules/shared/NotificationsPage';
import { AnnouncementsPage } from './modules/shared/AnnouncementsPage';
import { DocumentsPage } from './modules/shared/DocumentsPage';
import { AssembliesPage } from './modules/shared/AssembliesPage';
import { ProfilePage } from './modules/shared/ProfilePage';
import { ConciergePage } from './modules/shared/ConciergePage';
import { ProfessionalsPage } from './modules/shared/ProfessionalsPage';

import { GateConsole } from './modules/gate/GateConsole';
import { GateVisitors } from './modules/gate/GateVisitors';
import { GateAccess } from './modules/gate/GateAccess';
import { PlateScanner } from './modules/gate/PlateScanner';
import { GateDeliveries } from './modules/gate/GateDeliveries';
import { GateResidents } from './modules/gate/GateResidents';
import { GatesPanel } from './modules/gate/GatesPanel';
import { CamerasPage } from './modules/gate/CamerasPage';
import { GateIncidents } from './modules/gate/GateIncidents';
import { MonitorMode } from './modules/gate/MonitorMode';

import { ManagementDashboard } from './modules/management/ManagementDashboard';
import { ManagementResidents } from './modules/management/ManagementResidents';
import { ManagementUnits } from './modules/management/ManagementUnits';
import { ManagementAccess } from './modules/management/ManagementAccess';
import { ManagementVisitors } from './modules/management/ManagementVisitors';
import { ManagementVehicles } from './modules/management/ManagementVehicles';
import { ManagementStaff } from './modules/management/ManagementStaff';
import { ManagementDeliveries } from './modules/management/ManagementDeliveries';
import { ManagementReservations } from './modules/management/ManagementReservations';
import { ManagementTickets } from './modules/management/ManagementTickets';
import { ManagementIncidents } from './modules/management/ManagementIncidents';
import { ManagementMaintenance } from './modules/management/ManagementMaintenance';
import { ManagementFinance } from './modules/management/ManagementFinance';
import { ManagementSecurity } from './modules/management/ManagementSecurity';
import { ManagementAudit } from './modules/management/ManagementAudit';
import { ManagementSettings } from './modules/management/ManagementSettings';

import { PortfolioOverview } from './modules/portfolio/PortfolioOverview';
import { PortfolioIndicators } from './modules/portfolio/PortfolioIndicators';
import { PortfolioCondominiums } from './modules/portfolio/PortfolioCondominiums';

import { NotFoundPage } from './modules/shared/NotFoundPage';
import { ForbiddenPage } from './modules/shared/ForbiddenPage';

/* ---------------- Guards ---------------- */

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useSession();
  if (!can(permission)) return <ForbiddenPage />;
  return <>{children}</>;
}

function RootRedirect() {
  const { user } = useSession();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeRouteFor(user)} replace />;
}

/* ---------------- Rotas ---------------- */

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Modo monitor da portaria: tela cheia, sem shell */}
      <Route
        path="/portaria/monitor"
        element={<RequireAuth><RequirePermission permission="access.view"><MonitorMode /></RequirePermission></RequireAuth>}
      />

      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        {/* -------- Morador -------- */}
        <Route path="/app" element={<ResidentHome />} />
        <Route path="/app/visitantes" element={<RequirePermission permission="visitors.view"><ResidentVisitors /></RequirePermission>} />
        <Route path="/app/acessos" element={<RequirePermission permission="access.view"><ResidentAccess /></RequirePermission>} />
        <Route path="/app/encomendas" element={<RequirePermission permission="deliveries.view"><ResidentDeliveries /></RequirePermission>} />
        <Route path="/app/reservas" element={<RequirePermission permission="reservations.view"><ResidentReservations /></RequirePermission>} />
        <Route path="/app/financeiro" element={<RequirePermission permission="finance.personal"><ResidentFinance /></RequirePermission>} />
        <Route path="/app/chamados" element={<RequirePermission permission="tickets.view"><ResidentTickets /></RequirePermission>} />
        <Route path="/app/ocorrencias" element={<RequirePermission permission="incidents.view"><ResidentIncidents /></RequirePermission>} />
        <Route path="/app/veiculos" element={<RequirePermission permission="vehicles.view"><ResidentVehicles /></RequirePermission>} />
        <Route path="/app/funcionarios" element={<RequirePermission permission="staff.view"><ResidentStaff /></RequirePermission>} />
        <Route
          path="/app/profissionais"
          element={(
            <RequirePermission permission="professionals.view">
              <ProfessionalsPage subtitle="Prestadores indicados pela administração e avaliados pelos vizinhos" />
            </RequirePermission>
          )}
        />
        <Route path="/app/comunicados" element={<AnnouncementsPage />} />
        <Route path="/app/documentos" element={<DocumentsPage />} />
        <Route path="/app/assembleias" element={<AssembliesPage />} />
        <Route path="/app/notificacoes" element={<NotificationsPage />} />
        <Route path="/app/concierge" element={<ConciergePage />} />
        <Route path="/app/perfil" element={<ProfilePage />} />

        {/* -------- Portaria -------- */}
        <Route path="/portaria" element={<RequirePermission permission="access.register"><GateConsole /></RequirePermission>} />
        <Route path="/portaria/visitantes" element={<RequirePermission permission="visitors.approve"><GateVisitors /></RequirePermission>} />
        <Route path="/portaria/acessos" element={<RequirePermission permission="access.view"><GateAccess /></RequirePermission>} />
        <Route path="/portaria/placas" element={<RequirePermission permission="access.register"><PlateScanner /></RequirePermission>} />
        <Route path="/portaria/encomendas" element={<RequirePermission permission="deliveries.manage"><GateDeliveries /></RequirePermission>} />
        <Route path="/portaria/moradores" element={<RequirePermission permission="residents.view"><GateResidents /></RequirePermission>} />
        <Route path="/portaria/portoes" element={<RequirePermission permission="gates.operate"><GatesPanel /></RequirePermission>} />
        <Route path="/portaria/cameras" element={<RequirePermission permission="cameras.view"><CamerasPage /></RequirePermission>} />
        <Route path="/portaria/ocorrencias" element={<RequirePermission permission="incidents.view"><GateIncidents /></RequirePermission>} />

        {/* -------- Gestão -------- */}
        <Route path="/gestao" element={<RequirePermission permission="dashboard.view"><ManagementDashboard /></RequirePermission>} />
        <Route path="/gestao/moradores" element={<RequirePermission permission="residents.view"><ManagementResidents /></RequirePermission>} />
        <Route path="/gestao/unidades" element={<RequirePermission permission="units.view"><ManagementUnits /></RequirePermission>} />
        <Route path="/gestao/acessos" element={<RequirePermission permission="access.view"><ManagementAccess /></RequirePermission>} />
        <Route path="/gestao/visitantes" element={<RequirePermission permission="visitors.view"><ManagementVisitors /></RequirePermission>} />
        <Route path="/gestao/veiculos" element={<RequirePermission permission="vehicles.view"><ManagementVehicles /></RequirePermission>} />
        <Route path="/gestao/funcionarios" element={<RequirePermission permission="staff.view"><ManagementStaff /></RequirePermission>} />
        <Route path="/gestao/encomendas" element={<RequirePermission permission="deliveries.view"><ManagementDeliveries /></RequirePermission>} />
        <Route path="/gestao/reservas" element={<RequirePermission permission="reservations.view"><ManagementReservations /></RequirePermission>} />
        <Route path="/gestao/chamados" element={<RequirePermission permission="tickets.view"><ManagementTickets /></RequirePermission>} />
        <Route path="/gestao/ocorrencias" element={<RequirePermission permission="incidents.view"><ManagementIncidents /></RequirePermission>} />
        <Route path="/gestao/manutencao" element={<RequirePermission permission="maintenance.view"><ManagementMaintenance /></RequirePermission>} />
        <Route
          path="/gestao/profissionais"
          element={(
            <RequirePermission permission="professionals.view">
              <ProfessionalsPage subtitle="Catálogo indicado ao condomínio e pedidos de orçamento dos moradores" />
            </RequirePermission>
          )}
        />
        <Route path="/gestao/financeiro" element={<RequirePermission permission="finance.admin"><ManagementFinance /></RequirePermission>} />
        <Route path="/gestao/comunicados" element={<AnnouncementsPage />} />
        <Route path="/gestao/documentos" element={<DocumentsPage />} />
        <Route path="/gestao/assembleias" element={<AssembliesPage />} />
        <Route path="/gestao/seguranca" element={<RequirePermission permission="security.view"><ManagementSecurity /></RequirePermission>} />
        <Route path="/gestao/auditoria" element={<RequirePermission permission="audit.view"><ManagementAudit /></RequirePermission>} />
        <Route path="/gestao/notificacoes" element={<NotificationsPage />} />
        <Route path="/gestao/concierge" element={<ConciergePage />} />
        <Route path="/gestao/configuracoes" element={<RequirePermission permission="settings.manage"><ManagementSettings /></RequirePermission>} />

        {/* -------- Administradora -------- */}
        <Route path="/portfolio" element={<RequirePermission permission="portfolio.view"><PortfolioOverview /></RequirePermission>} />
        <Route path="/portfolio/indicadores" element={<RequirePermission permission="portfolio.view"><PortfolioIndicators /></RequirePermission>} />
        <Route path="/portfolio/condominios" element={<RequirePermission permission="portfolio.view"><PortfolioCondominiums /></RequirePermission>} />
      </Route>

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </SessionProvider>
  );
}
