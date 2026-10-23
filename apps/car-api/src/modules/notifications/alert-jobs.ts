/* =========================================================
   Rotinas de alerta. Cada uma consulta a situação real e cria
   notificações com dedupeKey estável (alerta + referência +
   janela): rodar a rotina de novo não repete o aviso, e um
   novo estágio (de "vence em breve" para "venceu") gera um
   aviso novo.
   ========================================================= */
import { formatPlate, isoDateInZone, maintenanceDue, type NotificationSeverity, type Permission } from '@nortycar/shared';
import type { Tx } from '../../common/prisma.service';
import { num } from '../../common/serialize.interceptor';
import type { JobDeps, ScheduledJob } from './jobs.registry';

const DAY = 86_400_000;

/** Meia-noite de hoje no fuso de Brasília (UTC−3), em UTC. */
export function todayStart(now: Date): Date {
  return new Date(`${isoDateInZone(now)}T03:00:00.000Z`);
}

/** Data pura (gravada como meia-noite UTC) no formato brasileiro. */
function br(date: Date): string {
  const [y, m, d] = date.toISOString().slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function daysLeft(date: Date, now: Date): number {
  const target = new Date(`${date.toISOString().slice(0, 10)}T03:00:00.000Z`);
  return Math.round((target.getTime() - todayStart(now).getTime()) / DAY);
}

function when(days: number): string {
  if (days < 0) return `venceu há ${-days} dia(s)`;
  if (days === 0) return 'vence hoje';
  return `vence em ${days} dia(s)`;
}

function stage(days: number): 'expired' | 'soon' {
  return days < 0 ? 'expired' : 'soon';
}

function severity(days: number, critical = 0): NotificationSeverity {
  return days < critical ? 'CRITICAL' : 'WARNING';
}

interface Alert {
  type: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  link: string;
  audiencePermission?: Permission;
  customerId?: string;
  branchId?: string | null;
  dedupeKey: string;
}

async function emit(tx: Tx, organizationId: string, deps: JobDeps, alerts: Alert[]): Promise<number> {
  let created = 0;
  for (const alert of alerts) {
    if (await deps.notify.notify(tx, organizationId, alert)) created += 1;
  }
  return created;
}

/* ---------------- Pessoas e documentos ---------------- */

const cnh: ScheduledJob = {
  key: 'alerts.cnh',
  description: 'CNH de motoristas vencendo ou vencida',
  async run(tx, orgId, deps) {
    const limit = new Date(deps.now.getTime() + deps.settings.documentAlertDays * DAY);
    const drivers = await tx.driver.findMany({ where: { active: true, anonymizedAt: null, cnhExpiresAt: { lte: limit } } });
    return emit(tx, orgId, deps, drivers.map((d) => {
      const left = daysLeft(d.cnhExpiresAt, deps.now);
      return {
        type: 'cnh_expiring', severity: severity(left), audiencePermission: 'customers.view',
        title: left < 0 ? `CNH vencida: ${d.name}` : `CNH vencendo: ${d.name}`,
        body: `A CNH ${when(left)} (${br(d.cnhExpiresAt)}). Locações com este motorista podem ser recusadas.`,
        link: '/pessoas/motoristas', dedupeKey: `cnh:${d.id}:${d.cnhExpiresAt.toISOString().slice(0, 10)}:${stage(left)}`,
      } satisfies Alert;
    }));
  },
};

const vehicleDocuments: ScheduledJob = {
  key: 'alerts.vehicle_documents',
  description: 'Licenciamento e IPVA vencendo',
  async run(tx, orgId, deps) {
    const limit = new Date(deps.now.getTime() + deps.settings.documentAlertDays * DAY);
    const vehicles = await tx.vehicleUnit.findMany({
      where: { deletedAt: null, commercialStatus: { not: 'SOLD' }, OR: [{ licensingDueDate: { lte: limit } }, { ipvaDueDate: { lte: limit } }] },
    });
    const alerts: Alert[] = [];
    for (const v of vehicles) {
      for (const [field, label] of [['licensingDueDate', 'Licenciamento'], ['ipvaDueDate', 'IPVA']] as const) {
        const date = v[field];
        if (!date || date > limit) continue;
        const left = daysLeft(date, deps.now);
        alerts.push({
          type: field === 'licensingDueDate' ? 'licensing_due' : 'ipva_due', severity: severity(left), audiencePermission: 'fleet.view',
          branchId: v.branchId, title: `${label} — ${formatPlate(v.plate)}`, body: `${label} ${when(left)} (${br(date)}).`,
          link: `/frota/veiculos/${v.id}`, dedupeKey: `${field}:${v.id}:${date.toISOString().slice(0, 10)}:${stage(left)}`,
        });
      }
    }
    return emit(tx, orgId, deps, alerts);
  },
};

const files: ScheduledJob = {
  key: 'alerts.files',
  description: 'Documentos anexados com validade',
  async run(tx, orgId, deps) {
    const limit = new Date(deps.now.getTime() + deps.settings.documentAlertDays * DAY);
    const list = await tx.fileAsset.findMany({ where: { deletedAt: null, expiresAt: { lte: limit } } });
    return emit(tx, orgId, deps, list.map((f) => {
      const left = daysLeft(f.expiresAt!, deps.now);
      const personal = f.entityType === 'Customer' || f.entityType === 'Driver';
      return {
        type: 'document_expiring', severity: severity(left), audiencePermission: personal ? 'customers.view' : 'fleet.view',
        title: `Documento ${left < 0 ? 'vencido' : 'vencendo'}: ${f.category ?? f.originalName}`,
        body: `"${f.originalName}" ${when(left)} (${br(f.expiresAt!)}).`, link: '/regularizacao/documentos',
        dedupeKey: `file:${f.id}:${f.expiresAt!.toISOString().slice(0, 10)}:${stage(left)}`,
      } satisfies Alert;
    }));
  },
};

const policies: ScheduledJob = {
  key: 'alerts.policies',
  description: 'Apólices de seguro vencendo',
  async run(tx, orgId, deps) {
    const limit = new Date(deps.now.getTime() + deps.settings.documentAlertDays * DAY);
    const list = await tx.insurancePolicy.findMany({ where: { active: true, endsAt: { lte: limit } }, include: { insurer: { select: { name: true } } } });
    return emit(tx, orgId, deps, list.map((p) => {
      const left = daysLeft(p.endsAt, deps.now);
      return {
        type: 'insurance_expiring', severity: severity(left), audiencePermission: 'claims.view',
        title: `Seguro ${left < 0 ? 'vencido' : 'vencendo'}: apólice ${p.policyNumber}`, body: `Apólice da ${p.insurer.name} ${when(left)} (${br(p.endsAt)}).`,
        link: '/regularizacao/seguros', dedupeKey: `policy:${p.id}:${p.endsAt.toISOString().slice(0, 10)}:${stage(left)}`,
      } satisfies Alert;
    }));
  },
};

/* ---------------- Regularização ---------------- */

const infractionDeadlines: ScheduledJob = {
  key: 'alerts.infraction_deadlines',
  description: 'Prazos de indicação de condutor, defesa e vencimento de multas',
  async run(tx, orgId, deps) {
    const limit = new Date(deps.now.getTime() + 10 * DAY);
    const list = await tx.trafficInfraction.findMany({
      where: {
        adminStatus: { notIn: ['CANCELLED', 'FINISHED', 'GRANTED'] },
        OR: [{ driverIndicationDeadline: { lte: limit } }, { defenseDeadline: { lte: limit } }, { dueDate: { lte: limit } }],
      },
      include: { vehicle: { select: { plate: true, branchId: true } } },
    });
    const alerts: Alert[] = [];
    for (const i of list) {
      const checks: [Date | null, string, string, boolean][] = [
        [i.driverIndicationDeadline, 'indication', 'Indicação de condutor', ['RECEIVED', 'UNDER_REVIEW', 'AWAITING_DRIVER_ID'].includes(i.adminStatus)],
        [i.defenseDeadline, 'defense', 'Prazo de defesa', i.adminStatus !== 'APPEALING' && i.adminStatus !== 'DENIED'],
        [i.dueDate, 'due', 'Vencimento da multa', ['PENDING', 'BILLING'].includes(i.financialStatus)],
      ];
      for (const [date, key, label, applies] of checks) {
        if (!date || !applies || date > limit) continue;
        const left = daysLeft(date, deps.now);
        alerts.push({
          type: 'infraction_deadline', severity: left <= 2 ? 'CRITICAL' : 'WARNING', audiencePermission: 'infractions.manage',
          branchId: i.vehicle.branchId, title: `${label}: auto ${i.autoNumber}`,
          body: `${label} da infração ${i.autoNumber} (${formatPlate(i.vehicle.plate)}) ${when(left)} (${br(date)}).`,
          link: '/regularizacao/infracoes', dedupeKey: `infraction:${i.id}:${key}:${date.toISOString().slice(0, 10)}:${stage(left)}`,
        });
      }
    }
    return emit(tx, orgId, deps, alerts);
  },
};

/* ---------------- Financeiro ---------------- */

const receivables: ScheduledJob = {
  key: 'alerts.receivables',
  description: 'Contas a receber vencidas (inadimplência) e a vencer para o cliente',
  async run(tx, orgId, deps) {
    const today = todayStart(deps.now);
    const soon = new Date(today.getTime() + 3 * DAY);
    const list = await tx.receivable.findMany({
      where: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: soon } },
      include: { customer: { select: { id: true, name: true } } },
    });
    const alerts: Alert[] = [];
    for (const r of list) {
      const left = daysLeft(r.dueDate, deps.now);
      const balance = num(r.amount) - num(r.paidAmount);
      if (left < 0) {
        alerts.push({
          type: 'receivable_overdue', severity: left < -15 ? 'CRITICAL' : 'WARNING', audiencePermission: 'finance.view', branchId: r.branchId,
          title: `Pagamento em atraso${r.customer ? `: ${r.customer.name}` : ''}`,
          body: `${r.description} — saldo R$ ${balance.toFixed(2)}, ${when(left)}.`, link: '/financeiro/receber',
          dedupeKey: `receivable:${r.id}:overdue`,
        });
        if (r.customerId) {
          alerts.push({
            type: 'receivable_overdue', severity: 'WARNING', customerId: r.customerId, title: 'Pagamento em atraso',
            body: `${r.description} venceu em ${br(r.dueDate)}. Saldo: R$ ${balance.toFixed(2)}.`, link: '/cliente/financeiro',
            dedupeKey: `customer-receivable:${r.id}:overdue`,
          });
        }
      } else if (r.customerId) {
        alerts.push({
          type: 'receivable_due', severity: 'INFO', customerId: r.customerId, title: 'Pagamento próximo do vencimento',
          body: `${r.description} ${when(left)} (${br(r.dueDate)}). Valor: R$ ${balance.toFixed(2)}.`, link: '/cliente/financeiro',
          dedupeKey: `customer-receivable:${r.id}:due`,
        });
      }
    }
    return emit(tx, orgId, deps, alerts);
  },
};

const payables: ScheduledJob = {
  key: 'alerts.payables',
  description: 'Contas a pagar vencendo ou vencidas',
  async run(tx, orgId, deps) {
    const soon = new Date(todayStart(deps.now).getTime() + 3 * DAY);
    const list = await tx.payable.findMany({ where: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: soon } } });
    return emit(tx, orgId, deps, list.map((p) => {
      const left = daysLeft(p.dueDate, deps.now);
      return {
        type: 'payable_due', severity: severity(left), audiencePermission: 'finance.payables', branchId: p.branchId,
        title: `Conta a pagar ${left < 0 ? 'vencida' : 'vencendo'}`, body: `${p.description} — R$ ${(num(p.amount) - num(p.paidAmount)).toFixed(2)}, ${when(left)}.`,
        link: '/financeiro/pagar', dedupeKey: `payable:${p.id}:${stage(left)}`,
      } satisfies Alert;
    }));
  },
};

const deposits: ScheduledJob = {
  key: 'alerts.deposits',
  description: 'Cauções de contratos encerrados aguardando devolução',
  async run(tx, orgId, deps) {
    const list = await tx.securityDeposit.findMany({
      where: { status: { in: ['HELD', 'PARTIALLY_USED', 'REFUND_PENDING'] }, contract: { status: { in: ['CLOSED', 'TERMINATED'] } } },
      include: { contract: { select: { id: true, number: true, branchId: true } }, customer: { select: { name: true } } },
    });
    return emit(tx, orgId, deps, list.map((d) => ({
      type: 'deposit_refund_pending', severity: 'WARNING', audiencePermission: 'deposits.manage', branchId: d.contract.branchId,
      title: `Caução a devolver: ${d.contract.number}`, body: `O contrato de ${d.customer.name} foi encerrado e o caução ainda tem saldo.`,
      link: `/locacoes/contratos/${d.contract.id}`, dedupeKey: `deposit:${d.id}:refund`,
    } satisfies Alert)));
  },
};

/* ---------------- Locações ---------------- */

const contractsEnding: ScheduledJob = {
  key: 'alerts.contracts_ending',
  description: 'Contratos próximos do fim',
  async run(tx, orgId, deps) {
    const limit = new Date(deps.now.getTime() + 7 * DAY);
    const longLimit = new Date(deps.now.getTime() + deps.settings.documentAlertDays * DAY);
    const list = await tx.rentalContract.findMany({
      where: { status: 'ACTIVE', OR: [{ kind: 'PERIOD', endAt: { lte: limit } }, { kind: 'LONG_TERM', endAt: { lte: longLimit } }] },
      include: { customer: { select: { name: true } } },
    });
    return emit(tx, orgId, deps, list.map((c) => {
      const left = daysLeft(c.endAt, deps.now);
      return {
        type: 'contract_ending', severity: left < 0 ? 'CRITICAL' : 'INFO', audiencePermission: 'contracts.view', branchId: c.branchId,
        title: `${left < 0 ? 'Devolução atrasada' : 'Contrato perto do fim'}: ${c.number}`,
        body: `Contrato de ${c.customer.name} ${left < 0 ? `terminou há ${-left} dia(s)` : left === 0 ? 'termina hoje' : `termina em ${left} dia(s)`}.`,
        link: `/locacoes/contratos/${c.id}`, dedupeKey: `contract:${c.id}:${c.endAt.toISOString()}:${stage(left)}`,
      } satisfies Alert;
    }));
  },
};

const todaysMovements: ScheduledJob = {
  key: 'alerts.pickups_returns',
  description: 'Retiradas e devoluções previstas para hoje',
  async run(tx, orgId, deps) {
    const start = todayStart(deps.now);
    const end = new Date(start.getTime() + DAY);
    const date = isoDateInZone(deps.now);
    const [reservations, contracts, returns] = await Promise.all([
      tx.reservation.findMany({ where: { status: 'CONFIRMED', startAt: { gte: start, lt: end } }, include: { customer: { select: { name: true } } } }),
      tx.rentalContract.findMany({ where: { status: 'APPROVED', startAt: { gte: start, lt: end } }, include: { customer: { select: { name: true } } } }),
      tx.rentalContract.findMany({ where: { status: 'ACTIVE', endAt: { gte: start, lt: end } }, include: { customer: { select: { name: true } } } }),
    ]);
    const alerts: Alert[] = [
      ...reservations.map((r) => ({
        type: 'pickup_today', severity: 'INFO' as const, audiencePermission: 'reservations.view' as const, branchId: r.branchId,
        title: `Retirada hoje: ${r.code}`, body: `${r.customer.name} retira o veículo hoje.`, link: '/locacoes/retiradas', dedupeKey: `pickup:reservation:${r.id}:${date}`,
      })),
      ...contracts.map((c) => ({
        type: 'pickup_today', severity: 'INFO' as const, audiencePermission: 'contracts.view' as const, branchId: c.branchId,
        title: `Entrega hoje: ${c.number}`, body: `${c.customer.name} recebe o veículo hoje.`, link: '/locacoes/retiradas', dedupeKey: `pickup:contract:${c.id}:${date}`,
      })),
      ...returns.map((c) => ({
        type: 'return_today', severity: 'INFO' as const, audiencePermission: 'contracts.view' as const, branchId: c.branchId,
        title: `Devolução hoje: ${c.number}`, body: `${c.customer.name} devolve o veículo hoje.`, link: '/locacoes/devolucoes', dedupeKey: `return:${c.id}:${date}`,
      })),
    ];
    return emit(tx, orgId, deps, alerts);
  },
};

/* ---------------- Operação ---------------- */

const lateWorkOrders: ScheduledJob = {
  key: 'alerts.work_orders_late',
  description: 'Ordens de serviço com prazo vencido',
  async run(tx, orgId, deps) {
    const list = await tx.workOrder.findMany({
      where: { dueAt: { lt: deps.now }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      include: { vehicle: { select: { plate: true } } },
    });
    return emit(tx, orgId, deps, list.map((w) => ({
      type: 'work_order_late', severity: 'WARNING', audiencePermission: 'maintenance.view', branchId: w.branchId,
      title: `OS atrasada: ${w.number}`, body: `A OS do veículo ${formatPlate(w.vehicle.plate)} passou do prazo.`,
      link: `/operacao/ordens-servico/${w.id}`, dedupeKey: `work-order:${w.id}:late:${w.dueAt!.toISOString()}`,
    } satisfies Alert)));
  },
};

const lowStock: ScheduledJob = {
  key: 'alerts.low_stock',
  description: 'Produtos abaixo do estoque mínimo',
  async run(tx, orgId, deps) {
    const products = await tx.inventoryProduct.findMany({ where: { active: true, minStock: { gt: 0 } }, include: { balances: true } });
    const week = weekKey(deps.now);
    const alerts: Alert[] = [];
    for (const p of products) {
      const total = p.balances.reduce((acc, b) => acc + num(b.quantity), 0);
      if (total >= num(p.minStock)) continue;
      alerts.push({
        type: 'low_stock', severity: total <= 0 ? 'CRITICAL' : 'WARNING', audiencePermission: 'inventory.view',
        title: `Estoque abaixo do mínimo: ${p.description}`, body: `Saldo ${total} ${p.unit} (mínimo ${num(p.minStock)}).`,
        link: '/operacao/estoque', dedupeKey: `stock:${p.id}:low:${week}`,
      });
    }
    return emit(tx, orgId, deps, alerts);
  },
};

const maintenancePlans: ScheduledJob = {
  key: 'alerts.maintenance_plans',
  description: 'Manutenções preventivas vencendo ou vencidas',
  async run(tx, orgId, deps) {
    const plans = await tx.maintenancePlan.findMany({
      where: { active: true, vehicle: { deletedAt: null, commercialStatus: { not: 'SOLD' } } },
      include: { vehicle: { select: { id: true, plate: true, odometerKm: true, branchId: true } } },
    });
    const alerts: Alert[] = [];
    for (const p of plans) {
      const due = maintenanceDue({
        intervalKm: p.intervalKm, intervalDays: p.intervalDays, lastDoneKm: p.lastDoneKm, lastDoneAt: p.lastDoneAt,
        currentKm: p.vehicle.odometerKm, alertKmBefore: p.alertKmBefore, alertDaysBefore: p.alertDaysBefore, now: deps.now,
      });
      if (due.state !== 'DUE_SOON' && due.state !== 'OVERDUE') continue;
      const detail = [due.kmRemaining !== null ? `${due.kmRemaining} km restantes` : null, due.daysRemaining !== null ? `${due.daysRemaining} dia(s) restantes` : null].filter(Boolean).join(', ');
      alerts.push({
        type: 'maintenance_due', severity: due.state === 'OVERDUE' ? 'CRITICAL' : 'WARNING', audiencePermission: 'maintenance.view',
        branchId: p.vehicle.branchId, title: `${due.state === 'OVERDUE' ? 'Manutenção vencida' : 'Manutenção próxima'}: ${formatPlate(p.vehicle.plate)}`,
        body: `${p.name} — ${detail}.`, link: '/operacao/manutencao',
        dedupeKey: `maintenance:${p.id}:${p.lastDoneAt?.toISOString() ?? 'base'}:${p.lastDoneKm ?? 'base'}:${due.state}`,
      });
    }
    return emit(tx, orgId, deps, alerts);
  },
};

/* ---------------- Plataforma ---------------- */

const domains: ScheduledJob = {
  key: 'alerts.domains',
  description: 'Domínio do site com configuração incorreta',
  async run(tx, orgId, deps) {
    // Domínio é tabela de plataforma (sem RLS): o filtro por empresa é explícito.
    const list = await tx.domain.findMany({ where: { organizationId: orgId, status: 'MISCONFIGURED' } });
    return emit(tx, orgId, deps, list.map((d) => ({
      type: 'domain_misconfigured', severity: 'CRITICAL', audiencePermission: 'domains.manage',
      title: `Domínio com configuração incorreta: ${d.hostname}`, body: d.lastCheckError ?? 'Os registros DNS não apontam para o Norty Car.',
      link: '/admin/dominios', dedupeKey: `domain:${d.id}:misconfigured:${d.lastCheckedAt?.toISOString().slice(0, 10) ?? ''}`,
    } satisfies Alert)));
  },
};

function weekKey(date: Date): string {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return `${date.getUTCFullYear()}-W${Math.ceil(((date.getTime() - start) / DAY + 1) / 7)}`;
}

export const ALERT_JOBS: ScheduledJob[] = [
  cnh, vehicleDocuments, files, policies, infractionDeadlines, receivables, payables, deposits,
  contractsEnding, todaysMovements, lateWorkOrders, lowStock, maintenancePlans, domains,
];

/** Roda todas as rotinas para uma empresa, numa transação já escopada. Usado pelo agendador e pelos testes. */
export async function runJobsForOrganization(tx: Tx, organizationId: string, deps: JobDeps, jobs: ScheduledJob[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const job of jobs) {
    result[job.key] = Number((await job.run(tx, organizationId, deps)) ?? 0);
  }
  return result;
}
