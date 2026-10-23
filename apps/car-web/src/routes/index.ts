/* Registro de rotas da equipe. Cada grupo de módulos mantém o seu arquivo. */
import type { AppRoute } from './types';
import { FOUNDATION_ROUTES } from './foundation';
import { FLEET_ROUTES } from './fleet';
import { RENTALS_ROUTES } from './rentals';
import { OPERATIONS_ROUTES } from './operations';
import { REGULARIZATION_ROUTES } from './regularization';
import { INSIGHTS_ROUTES } from './insights';
import { PORTALS_STAFF_ROUTES } from './portals';

export const STAFF_ROUTES: AppRoute[] = [
  ...FOUNDATION_ROUTES,
  ...FLEET_ROUTES,
  ...RENTALS_ROUTES,
  ...OPERATIONS_ROUTES,
  ...REGULARIZATION_ROUTES,
  ...INSIGHTS_ROUTES,
  ...PORTALS_STAFF_ROUTES,
];

export { MASTER_ROUTES, PORTAL_ROUTES } from './portals';
