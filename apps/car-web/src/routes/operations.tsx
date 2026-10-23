import type { AppRoute } from './types';
import { InspectionsPage } from '../modules/operations/InspectionsPage';
import { InspectionWizard } from '../modules/operations/InspectionWizard';
import { InspectionDetailPage } from '../modules/operations/InspectionDetailPage';
import { InventoryPage } from '../modules/operations/InventoryPage';
import { PurchasesPage } from '../modules/operations/PurchasesPage';
import { WorkOrdersPage } from '../modules/operations/WorkOrdersPage';
import { WorkOrderDetailPage } from '../modules/operations/WorkOrderDetailPage';
import { MaintenancePlansPage } from '../modules/operations/MaintenancePlansPage';
import { TiresPage } from '../modules/operations/TiresPage';
import { RefuelsPage } from '../modules/operations/RefuelsPage';

export const OPERATIONS_ROUTES: AppRoute[] = [
  { path: '/operacao/vistorias', element: <InspectionsPage />, permissions: ['inspections.view'] },
  { path: '/operacao/vistorias/nova', element: <InspectionWizard />, permissions: ['inspections.perform'] },
  { path: '/operacao/vistorias/:id', element: <InspectionDetailPage />, permissions: ['inspections.view'] },
  { path: '/operacao/estoque', element: <InventoryPage />, permissions: ['inventory.view'] },
  { path: '/operacao/compras', element: <PurchasesPage />, permissions: ['inventory.view', 'purchases.manage'] },
  { path: '/operacao/ordens-servico', element: <WorkOrdersPage />, permissions: ['maintenance.view'] },
  { path: '/operacao/ordens-servico/:id', element: <WorkOrderDetailPage />, permissions: ['maintenance.view'] },
  { path: '/operacao/manutencao', element: <MaintenancePlansPage />, permissions: ['maintenance.view'] },
  { path: '/operacao/pneus', element: <TiresPage />, permissions: ['maintenance.view'] },
  { path: '/operacao/abastecimentos', element: <RefuelsPage />, permissions: ['refuel.view'] },
];
