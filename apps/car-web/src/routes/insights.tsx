import type { AppRoute } from './types';
import { DashboardPage } from '../modules/insights/DashboardPage';
import { NotificationsPage } from '../modules/insights/NotificationsPage';
import { ReportsCatalogPage, ReportViewPage } from '../modules/insights/ReportsPage';
import { ProfitabilityPage } from '../modules/insights/ProfitabilityPage';
import { AiPage } from '../modules/insights/AiPage';

export const INSIGHTS_ROUTES: AppRoute[] = [
  { path: '/painel', element: <DashboardPage />, permissions: ['dashboard.view'] },
  { path: '/notificacoes', element: <NotificationsPage />, permissions: ['notifications.view'] },
  { path: '/relatorios', element: <ReportsCatalogPage />, permissions: ['reports.view', 'reports.financial'] },
  { path: '/relatorios/rentabilidade', element: <ProfitabilityPage />, permissions: ['reports.financial'] },
  { path: '/relatorios/:reportKey', element: <ReportViewPage />, permissions: ['reports.view', 'reports.financial'] },
  { path: '/ia', element: <AiPage />, permissions: ['ai.use'] },
];
