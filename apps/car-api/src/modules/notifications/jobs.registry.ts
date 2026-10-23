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

export const SCHEDULED_JOBS: ScheduledJob[] = [
  ...ALERT_JOBS,
];
