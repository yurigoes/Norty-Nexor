import type { Type } from '@nestjs/common';
import { InfractionsModule } from './infractions/infractions.module';
import { ClaimsModule } from './claims/claims.module';
import { SalesModule } from './sales/sales.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.controller';
import { ProfitabilityModule } from './profitability/profitability.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';

/** Regularização, venda de frota e indicadores (dashboard, relatórios, rotinas, busca, IA). */
export const REGULARIZATION_MODULES: Type[] = [
  InfractionsModule, ClaimsModule, SalesModule, NotificationsModule, SearchModule,
  ProfitabilityModule, DashboardModule, ReportsModule, AiModule,
];
