import type { AppRoute } from './types';
import { VehiclesPage } from '../modules/fleet/VehiclesPage';
import { VehicleDetailPage } from '../modules/fleet/VehicleDetailPage';
import { ModelsPage } from '../modules/fleet/ModelsPage';
import { ModelDetailPage } from '../modules/fleet/ModelDetailPage';
import { AvailabilityPage } from '../modules/fleet/AvailabilityPage';
import { HistoryPage } from '../modules/fleet/HistoryPage';
import { CustomersPage } from '../modules/people/CustomersPage';
import { CustomerDetailPage } from '../modules/people/CustomerDetailPage';
import { DriversPage } from '../modules/people/DriversPage';
import { RatesPage } from '../modules/pricing/RatesPage';
import { ExpiringDocumentsPage } from '../modules/documents/ExpiringDocumentsPage';

export const FLEET_ROUTES: AppRoute[] = [
  { path: '/frota/veiculos', element: <VehiclesPage />, permissions: ['fleet.view'] },
  { path: '/frota/veiculos/:id', element: <VehicleDetailPage />, permissions: ['fleet.view'] },
  { path: '/frota/modelos', element: <ModelsPage />, permissions: ['fleet.view'] },
  { path: '/frota/modelos/:id', element: <ModelDetailPage />, permissions: ['fleet.view'] },
  { path: '/frota/disponibilidade', element: <AvailabilityPage />, permissions: ['fleet.view'] },
  { path: '/frota/historico', element: <HistoryPage />, permissions: ['fleet.view'] },
  { path: '/pessoas/clientes', element: <CustomersPage />, permissions: ['customers.view'] },
  { path: '/pessoas/clientes/:id', element: <CustomerDetailPage />, permissions: ['customers.view'] },
  { path: '/pessoas/motoristas', element: <DriversPage />, permissions: ['customers.view'] },
  { path: '/locacoes/tarifas', element: <RatesPage />, permissions: ['pricing.manage', 'reservations.view'] },
  { path: '/regularizacao/documentos', element: <ExpiringDocumentsPage />, permissions: ['fleet.view', 'customers.view'] },
];
