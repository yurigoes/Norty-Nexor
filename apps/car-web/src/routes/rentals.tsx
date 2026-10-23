import type { AppRoute } from './types';
import { ReservationsPage } from '../modules/rentals/ReservationsPage';
import { ContractsPage } from '../modules/rentals/ContractsPage';
import { NewContractPage } from '../modules/rentals/NewContractPage';
import { ContractDetailPage } from '../modules/rentals/ContractDetailPage';
import { AgendaPage, PickupsPage, RenewalsPage, ReturnsPage } from '../modules/rentals/AgendaPages';
import { FinanceOverviewPage } from '../modules/finance/FinanceOverviewPage';
import { PayablesPage, ReceivablesPage } from '../modules/finance/TitlesPages';
import { DepositsPage, ReconciliationPage, SuppliersPage } from '../modules/finance/OtherFinancePages';

export const RENTALS_ROUTES: AppRoute[] = [
  { path: '/agenda', element: <AgendaPage />, permissions: ['reservations.view', 'contracts.view'] },
  { path: '/locacoes/reservas', element: <ReservationsPage />, permissions: ['reservations.view'] },
  { path: '/locacoes/contratos', element: <ContractsPage />, permissions: ['contracts.view'] },
  { path: '/locacoes/contratos/novo', element: <NewContractPage />, permissions: ['contracts.create'] },
  { path: '/locacoes/contratos/:id', element: <ContractDetailPage />, permissions: ['contracts.view'] },
  { path: '/locacoes/retiradas', element: <PickupsPage />, permissions: ['contracts.view'] },
  { path: '/locacoes/devolucoes', element: <ReturnsPage />, permissions: ['contracts.view'] },
  { path: '/locacoes/renovacoes', element: <RenewalsPage />, permissions: ['contracts.view'] },
  { path: '/financeiro', element: <FinanceOverviewPage />, permissions: ['finance.view'] },
  { path: '/financeiro/receber', element: <ReceivablesPage />, permissions: ['finance.view'] },
  { path: '/financeiro/pagar', element: <PayablesPage />, permissions: ['finance.view'] },
  { path: '/financeiro/caucoes', element: <DepositsPage />, permissions: ['deposits.view'] },
  { path: '/financeiro/conciliacao', element: <ReconciliationPage />, permissions: ['finance.reconcile'] },
  { path: '/financeiro/fornecedores', element: <SuppliersPage />, permissions: ['finance.payables', 'inventory.manage', 'purchases.manage'] },
];
