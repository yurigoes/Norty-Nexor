import type { Type } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module';
import { FleetModule } from './fleet/fleet.module';
import { CustomersModule } from './customers/customers.module';
import { DocumentsModule } from './documents/documents.module';

export const FLEET_MODULES: Type[] = [CatalogModule, FleetModule, CustomersModule, DocumentsModule];
