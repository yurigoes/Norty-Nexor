/* =========================================================
   Registro das rotinas agendadas.

   Cada rotina recebe a transação JÁ escopada na empresa (RLS
   ativo com app.org_id) e devolve quantos registros produziu.
   Para acrescentar uma rotina de outro módulo (expiração de
   pedidos do site, geração de mensalidades, alertas de
   manutenção e estoque…), importe a função e acrescente uma
   entrada em SCHEDULED_JOBS:

     { key: 'reservations.expire', description: '…',
       run: (tx, orgId) => expireRequested(tx, orgId) }

   Regras: a rotina precisa ser idempotente (rodar duas vezes
   não duplica nada — use dedupeKey nas notificações e as
   unicidades do banco nos lançamentos) e não pode chamar
   serviços externos dentro da transação.
   ========================================================= */
import type { Tx } from '../../common/prisma.service';
import type { NotifyService } from '../../common/notify.service';
import type { OrgSettings } from '../../common/org-settings';
import { ALERT_JOBS } from './alert-jobs';
import { expireRequested, generateDueInstallments } from '../contracts/rentals.jobs';
import { maintenanceAlerts } from '../maintenance/maintenance.jobs';
import { applyCheck } from '../domains/domains.jobs';

export interface JobDeps {
  notify: NotifyService;
  now: Date;
  settings: OrgSettings;
}

export interface ScheduledJob {
  key: string;
  description: string;
  run: (tx: Tx, organizationId: string, deps: JobDeps) => Promise<number | void>;
}

/** Rotinas de outros módulos, que mudam estado além de alertar. */
const MODULE_JOBS: ScheduledJob[] = [
  {
    key: 'reservations.expire',
    description: 'Expira pedidos de reserva não confirmados no prazo da empresa',
    run: (tx, orgId) => expireRequested(tx, orgId),
  },
  {
    key: 'contracts.installments',
    description: 'Gera as mensalidades que vencem nos próximos 35 dias (idempotente por competência)',
    run: (tx, orgId) => generateDueInstallments(tx, orgId, 35),
  },
  {
    // Substitui o alerta simples de planos: além de avisar, bloqueia o veículo
    // quando o plano manda bloquear manutenção vencida.
    key: 'maintenance.plans',
    description: 'Manutenções preventivas vencendo ou vencidas, com bloqueio configurável',
    run: async (tx, orgId) => (await maintenanceAlerts(tx, orgId)).length,
  },
  {
    // Reverifica o DNS dos domínios próprios da empresa antes do alerta de
    // domínio mal configurado. Domínio é tabela de plataforma: filtro explícito.
    key: 'domains.recheck',
    description: 'Reverifica DNS dos domínios próprios ativos',
    run: async (tx, orgId) => {
      const list = await tx.domain.findMany({ where: { organizationId: orgId, kind: 'CUSTOM', status: { in: ['ACTIVE', 'VERIFIED', 'MISCONFIGURED'] } }, take: 20 });
      for (const d of list) await applyCheck(tx, d);
      return list.length;
    },
  },
];

export const SCHEDULED_JOBS: ScheduledJob[] = [
  ...MODULE_JOBS,
  ...ALERT_JOBS.filter((j) => j.key !== 'alerts.maintenance_plans'),
];
