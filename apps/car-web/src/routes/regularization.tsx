import type { AppRoute } from './types';
import { InfractionDetailPage, InfractionsPage } from '../modules/regularization/InfractionsPage';
import { ClaimDetailPage, ClaimsPage } from '../modules/regularization/ClaimsPage';
import { PoliciesPage } from '../modules/regularization/PoliciesPage';
import { SalesPage } from '../modules/regularization/SalesPage';

export const REGULARIZATION_ROUTES: AppRoute[] = [
  { path: '/regularizacao/infracoes', element: <InfractionsPage />, permissions: ['infractions.view'] },
  { path: '/regularizacao/infracoes/:id', element: <InfractionDetailPage />, permissions: ['infractions.view'] },
  { path: '/regularizacao/sinistros', element: <ClaimsPage />, permissions: ['claims.view'] },
  { path: '/regularizacao/sinistros/:id', element: <ClaimDetailPage />, permissions: ['claims.view'] },
  { path: '/regularizacao/seguros', element: <PoliciesPage />, permissions: ['claims.view'] },
  { path: '/frota/venda', element: <SalesPage />, permissions: ['sales.view'] },
];
