/**
 * Registro dos módulos de negócio, por grupo. Cada grupo mantém a
 * própria lista para que módulos novos entrem sem disputar o
 * app.module.ts.
 */
import type { Type } from '@nestjs/common';
import { FOUNDATION_MODULES } from './registry.foundation';
import { FLEET_MODULES } from './registry.fleet';
import { RENTAL_MODULES } from './registry.rentals';
import { OPERATIONS_MODULES } from './registry.operations';
import { REGULARIZATION_MODULES } from './registry.regularization';
import { PORTAL_MODULES } from './registry.portals';

export const BUSINESS_MODULES: Type[] = [
  ...FOUNDATION_MODULES,
  ...FLEET_MODULES,
  ...RENTAL_MODULES,
  ...OPERATIONS_MODULES,
  ...REGULARIZATION_MODULES,
  ...PORTAL_MODULES,
];
