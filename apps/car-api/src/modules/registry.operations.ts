import type { Type } from '@nestjs/common';
import { InventoryModule } from './inventory/inventory.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { InspectionsModule } from './inspections/inspections.module';
import { TiresModule } from './tires/tires.module';
import { RefuelModule } from './refuel/refuel.module';

export const OPERATIONS_MODULES: Type[] = [InventoryModule, MaintenanceModule, InspectionsModule, TiresModule, RefuelModule];
