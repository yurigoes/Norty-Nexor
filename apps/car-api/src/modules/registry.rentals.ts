import type { Type } from '@nestjs/common';
import { FinanceModule } from './finance/finance.module';
import { SuppliersModule } from './suppliers/suppliers';
import { DepositsModule } from './deposits/deposits';
import { ContractsModule } from './contracts/contracts.controller';
import { ReservationsModule } from './reservations/reservations';
import { PaymentWebhooksModule } from './payments-webhooks/payments-webhooks';

export const RENTAL_MODULES: Type[] = [
  FinanceModule, SuppliersModule, DepositsModule, ContractsModule, ReservationsModule, PaymentWebhooksModule,
];

/** Rotinas idempotentes para a automação agendada (Grupo de notificações). */
export { generateDueInstallments, expireRequested } from './contracts/rentals.jobs';
