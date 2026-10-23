/* =========================================================
   Catálogo de relatórios.

   Cada relatório declara permissão (além de reports.view ou
   reports.financial), filtros, colunas tipadas e a consulta.
   A consulta recebe a transação JÁ escopada na empresa (RLS)
   e as filiais autorizadas — é o mesmo controle das telas.
   ========================================================= */
import {
  CLAIM_TYPE_LABEL, COMMERCIAL_STATUS_LABEL, CONTRACT_KIND_LABEL, CONTRACT_STATUS_LABEL, DEPOSIT_STATUS_LABEL,
  INFRACTION_ADMIN_STATUS_LABEL, INFRACTION_FINANCIAL_STATUS_LABEL, INSPECTION_STATUS_LABEL, INSPECTION_TYPE_LABEL,
  MOVEMENT_TYPE_LABEL, OPERATIONAL_STATUS_LABEL, PAYABLE_KIND_LABEL, RECEIVABLE_KIND_LABEL, RESERVATION_STATUS_LABEL,
  TITLE_STATUS_LABEL, WORK_ORDER_STATUS_LABEL, CLAIM_STATUS_LABEL, APPROVAL_STATUS_LABEL, PAYMENT_METHOD_LABEL,
  depositBalance, formatPlate, lateCharges, normalizePlate, onlyDigits, toCents, fromCents, type Permission,
} from '@nortycar/shared';
import type { Tx } from '../../common/prisma.service';
import type { AvailabilityService } from '../../common/availability.service';
import { num, numOrNull } from '../../common/serialize.interceptor';
import type { ProfitabilityService } from '../profitability/profitability.service';
import { todayStart } from '../notifications/alert-jobs';

export type ColumnType = 'text' | 'money' | 'date' | 'datetime' | 'number' | 'percent';

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ReportFilter {
  key: string;
  label: string;
  type: 'date' | 'text' | 'number' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
}

export type Row = Record<string, string | number | null>;

export interface RunInput {
  organizationId: string;
  from: Date;
  to: Date;
  branchIds: string[] | null;
  filters: Record<string, string>;
  deps: { profitability: ProfitabilityService; availability: AvailabilityService };
}

export interface ReportDef {
  key: string;
  title: string;
  group: 'Frota' | 'Locações' | 'Financeiro' | 'Operação' | 'Regularização' | 'Rentabilidade';
  description: string;
  financial: boolean;
  /** Permissões da tela correspondente (todas exigidas). */
  permissions: Permission[];
  /** Usa período (de/até). */
  period: boolean;
  filters: ReportFilter[];
  columns: ReportColumn[];
  run: (tx: Tx, input: RunInput) => Promise<Row[]>;
}

const DAY = 86_400_000;
const MAX_ROWS = 10_000;

const opts = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const branchOf = (ids: string[] | null) => (ids ? { branchId: { in: ids } } : {});
const vehicleBranch = (ids: string[] | null) => (ids ? { vehicle: { branchId: { in: ids } } } : {});
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const money = (v: unknown) => (v === null || v === undefined ? null : num(v as never));
const model = (m: { name: string; make: { name: string } }) => `${m.make.name} ${m.name}`;

const PLATE_COL: ReportColumn = { key: 'plate', label: 'Placa', type: 'text' };

export const REPORTS: ReportDef[] = [
  /* ================= Frota ================= */
  {
    key: 'fleet', title: 'Frota completa', group: 'Frota', financial: false, period: false,
    description: 'Todas as unidades com situação comercial e operacional, filial e quilometragem.',
    permissions: ['fleet.view'],
    filters: [
      { key: 'commercialStatus', label: 'Situação comercial', type: 'select', options: opts(COMMERCIAL_STATUS_LABEL) },
      { key: 'operationalStatus', label: 'Situação operacional', type: 'select', options: opts(OPERATIONAL_STATUS_LABEL) },
    ],
    columns: [
      { key: 'internalCode', label: 'Código', type: 'text' }, PLATE_COL, { key: 'model', label: 'Modelo', type: 'text' },
      { key: 'year', label: 'Ano/modelo', type: 'text' }, { key: 'color', label: 'Cor', type: 'text' }, { key: 'branch', label: 'Filial', type: 'text' },
      { key: 'commercial', label: 'Comercial', type: 'text' }, { key: 'operational', label: 'Operacional', type: 'text' },
      { key: 'odometerKm', label: 'Km', type: 'number' }, { key: 'licensing', label: 'Licenciamento', type: 'date' }, { key: 'ipva', label: 'IPVA', type: 'date' },
    ],
    async run(tx, { branchIds, filters }) {
      const rows = await tx.vehicleUnit.findMany({
        where: {
          ...branchOf(branchIds), deletedAt: null,
          ...(filters.commercialStatus ? { commercialStatus: filters.commercialStatus as never } : {}),
          ...(filters.operationalStatus ? { operationalStatus: filters.operationalStatus as never } : {}),
        },
        include: { model: { select: { name: true, make: { select: { name: true } } } }, branch: { select: { name: true } } },
        orderBy: { internalCode: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((v) => ({
        internalCode: v.internalCode, plate: formatPlate(v.plate), model: model(v.model), year: `${v.yearManufacture}/${v.yearModel}`,
        color: v.color, branch: v.branch.name, commercial: COMMERCIAL_STATUS_LABEL[v.commercialStatus], operational: OPERATIONAL_STATUS_LABEL[v.operationalStatus],
        odometerKm: v.odometerKm, licensing: dateOnly(v.licensingDueDate), ipva: dateOnly(v.ipvaDueDate),
      }));
    },
  },
  {
    key: 'availability', title: 'Disponibilidade por período', group: 'Frota', financial: false, period: true,
    description: 'Unidades livres no período, já descontando reservas, contratos, manutenções, bloqueios e tempo de preparo.',
    permissions: ['fleet.view'],
    filters: [],
    columns: [PLATE_COL, { key: 'model', label: 'Modelo', type: 'text' }, { key: 'category', label: 'Categoria', type: 'text' }, { key: 'branch', label: 'Filial', type: 'text' }, { key: 'odometerKm', label: 'Km', type: 'number' }],
    async run(tx, { organizationId, from, to, branchIds, deps }) {
      const units = await deps.availability.findAvailable(tx, organizationId, { startAt: from, endAt: to, branchIds: branchIds ?? undefined });
      return units.map((u) => ({ plate: formatPlate(u.plate), model: model(u.model), category: u.category.name, branch: u.branch.name, odometerKm: u.odometerKm }));
    },
  },
  {
    key: 'plate-history', title: 'Histórico por placa', group: 'Frota', financial: false, period: true,
    description: 'Linha do tempo completa de um veículo: contratos, vistorias, manutenções, multas, despesas e venda.',
    permissions: ['fleet.view'],
    filters: [{ key: 'plate', label: 'Placa', type: 'text', required: true }],
    columns: [{ key: 'at', label: 'Quando', type: 'datetime' }, { key: 'type', label: 'Tipo', type: 'text' }, { key: 'title', label: 'Evento', type: 'text' }, { key: 'description', label: 'Detalhe', type: 'text' }, { key: 'actor', label: 'Responsável', type: 'text' }],
    async run(tx, { from, to, branchIds, filters }) {
      const vehicle = await tx.vehicleUnit.findFirst({ where: { plate: normalizePlate(filters.plate ?? ''), ...branchOf(branchIds) } });
      if (!vehicle) return [];
      const events = await tx.vehicleTimelineEvent.findMany({ where: { vehicleUnitId: vehicle.id, at: { gte: from, lt: to } }, orderBy: { at: 'desc' }, take: MAX_ROWS });
      return events.map((e) => ({ at: iso(e.at), type: e.type, title: e.title, description: e.description, actor: e.actorName }));
    },
  },
  {
    key: 'driver-history', title: 'Histórico por motorista', group: 'Frota', financial: false, period: true,
    description: 'Contratos em que o motorista dirigiu, infrações e abastecimentos registrados.',
    permissions: ['fleet.view', 'customers.view'],
    filters: [{ key: 'cpf', label: 'CPF do motorista', type: 'text', required: true }],
    columns: [{ key: 'at', label: 'Quando', type: 'datetime' }, { key: 'kind', label: 'Tipo', type: 'text' }, { key: 'reference', label: 'Referência', type: 'text' }, PLATE_COL, { key: 'detail', label: 'Detalhe', type: 'text' }],
    async run(tx, { from, to, branchIds, filters }) {
      const driver = await tx.driver.findFirst({ where: { cpf: onlyDigits(filters.cpf ?? '') } });
      if (!driver) return [];
      const [links, infractions, refuels] = await Promise.all([
        tx.contractDriver.findMany({ where: { driverId: driver.id, startAt: { lt: to }, OR: [{ endAt: null }, { endAt: { gte: from } }], contract: branchOf(branchIds) }, include: { contract: { select: { number: true, vehicles: { include: { vehicle: { select: { plate: true } } } } } } } }),
        tx.trafficInfraction.findMany({ where: { driverId: driver.id, occurredAt: { gte: from, lt: to }, ...vehicleBranch(branchIds) }, include: { vehicle: { select: { plate: true } } } }),
        tx.refuelRecord.findMany({ where: { driverId: driver.id, at: { gte: from, lt: to }, ...vehicleBranch(branchIds) }, include: { vehicle: { select: { plate: true } } } }),
      ]);
      const rows: Row[] = [
        ...links.map((l) => ({ at: iso(l.startAt), kind: 'Contrato', reference: l.contract.number, plate: l.contract.vehicles.map((v) => formatPlate(v.vehicle.plate)).join(', '), detail: l.endAt ? `Até ${dateOnly(l.endAt)}` : 'Vínculo em aberto' })),
        ...infractions.map((i) => ({ at: iso(i.occurredAt), kind: 'Infração', reference: i.autoNumber, plate: formatPlate(i.vehicle.plate), detail: `${i.description} — R$ ${num(i.finalAmount).toFixed(2)}` })),
        ...refuels.map((r) => ({ at: iso(r.at), kind: 'Abastecimento', reference: r.station ?? '', plate: formatPlate(r.vehicle.plate), detail: `${num(r.liters)} L — R$ ${num(r.total).toFixed(2)}` })),
      ];
      return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    },
  },
  {
    key: 'occupancy', title: 'Ocupação', group: 'Frota', financial: false, period: true,
    description: 'Dias em contrato e dias indisponíveis por veículo no período.',
    permissions: ['fleet.view', 'contracts.view'],
    filters: [],
    columns: [PLATE_COL, { key: 'model', label: 'Modelo', type: 'text' }, { key: 'daysInFleet', label: 'Dias na frota', type: 'number' }, { key: 'daysRented', label: 'Dias alugado', type: 'number' }, { key: 'daysUnavailable', label: 'Dias indisponível', type: 'number' }, { key: 'idleDays', label: 'Dias parado', type: 'number' }, { key: 'occupancy', label: 'Ocupação', type: 'percent' }],
    async run(tx, { organizationId, from, to, branchIds, deps }) {
      const rows = await deps.profitability.compute(tx, organizationId, { from, to, branchIds });
      return rows.map((r) => ({ plate: formatPlate(r.plate), model: r.model, daysInFleet: r.daysInFleet, daysRented: r.daysRented, daysUnavailable: r.daysUnavailable, idleDays: r.idleDays, occupancy: r.occupancy }));
    },
  },
  {
    key: 'documents-expiring', title: 'Documentos vencendo', group: 'Frota', financial: false, period: false,
    description: 'CNH, licenciamento, IPVA, apólices e documentos anexados que vencem nos próximos dias.',
    permissions: ['fleet.view', 'customers.view'],
    filters: [{ key: 'days', label: 'Próximos dias', type: 'number' }],
    columns: [{ key: 'dueDate', label: 'Vencimento', type: 'date' }, { key: 'daysLeft', label: 'Dias', type: 'number' }, { key: 'kind', label: 'Documento', type: 'text' }, { key: 'reference', label: 'Referência', type: 'text' }],
    async run(tx, { branchIds, filters }) {
      const days = Math.min(365, Math.max(1, Number(filters.days) || 30));
      const limit = new Date(Date.now() + days * DAY);
      const today = todayStart(new Date()).getTime();
      const left = (d: Date) => Math.round((new Date(`${d.toISOString().slice(0, 10)}T03:00:00.000Z`).getTime() - today) / DAY);
      const [drivers, vehicles, policies, files] = await Promise.all([
        tx.driver.findMany({ where: { active: true, anonymizedAt: null, cnhExpiresAt: { lte: limit } } }),
        tx.vehicleUnit.findMany({ where: { ...branchOf(branchIds), deletedAt: null, commercialStatus: { not: 'SOLD' }, OR: [{ licensingDueDate: { lte: limit } }, { ipvaDueDate: { lte: limit } }] } }),
        tx.insurancePolicy.findMany({ where: { active: true, endsAt: { lte: limit } }, include: { insurer: { select: { name: true } } } }),
        tx.fileAsset.findMany({ where: { deletedAt: null, expiresAt: { lte: limit } } }),
      ]);
      const rows: Row[] = [];
      for (const d of drivers) rows.push({ dueDate: dateOnly(d.cnhExpiresAt), daysLeft: left(d.cnhExpiresAt), kind: 'CNH', reference: d.name });
      for (const v of vehicles) {
        if (v.licensingDueDate && v.licensingDueDate <= limit) rows.push({ dueDate: dateOnly(v.licensingDueDate), daysLeft: left(v.licensingDueDate), kind: 'Licenciamento', reference: formatPlate(v.plate) });
        if (v.ipvaDueDate && v.ipvaDueDate <= limit) rows.push({ dueDate: dateOnly(v.ipvaDueDate), daysLeft: left(v.ipvaDueDate), kind: 'IPVA', reference: formatPlate(v.plate) });
      }
      for (const p of policies) rows.push({ dueDate: dateOnly(p.endsAt), daysLeft: left(p.endsAt), kind: 'Apólice de seguro', reference: `${p.policyNumber} — ${p.insurer.name}` });
      for (const f of files) rows.push({ dueDate: dateOnly(f.expiresAt), daysLeft: left(f.expiresAt!), kind: f.category ?? 'Documento', reference: f.originalName });
      return rows.sort((a, b) => Number(a.daysLeft) - Number(b.daysLeft));
    },
  },

  /* ================= Locações ================= */
  ...(['ACTIVE', 'CLOSED', 'EXPIRING'] as const).map((mode): ReportDef => ({
    key: mode === 'ACTIVE' ? 'contracts-active' : mode === 'CLOSED' ? 'contracts-closed' : 'contracts-expiring',
    title: mode === 'ACTIVE' ? 'Contratos ativos' : mode === 'CLOSED' ? 'Contratos encerrados' : 'Contratos a vencer',
    group: 'Locações', financial: false, period: mode === 'CLOSED',
    description: mode === 'ACTIVE' ? 'Contratos em vigor com cliente, veículo atual e valores.'
      : mode === 'CLOSED' ? 'Contratos encerrados ou rescindidos no período.' : 'Contratos em vigor que terminam nos próximos dias.',
    permissions: ['contracts.view'],
    filters: mode === 'EXPIRING' ? [{ key: 'days', label: 'Próximos dias', type: 'number' }] : [{ key: 'kind', label: 'Modalidade', type: 'select', options: opts(CONTRACT_KIND_LABEL) }],
    columns: [
      { key: 'number', label: 'Contrato', type: 'text' }, { key: 'kind', label: 'Modalidade', type: 'text' }, { key: 'status', label: 'Situação', type: 'text' },
      { key: 'customer', label: 'Cliente', type: 'text' }, PLATE_COL, { key: 'startAt', label: 'Início', type: 'datetime' }, { key: 'endAt', label: 'Fim', type: 'datetime' },
      { key: 'monthly', label: 'Mensalidade', type: 'money' }, { key: 'total', label: 'Valor total', type: 'money' },
    ],
    async run(tx, { from, to, branchIds, filters }) {
      const where = mode === 'ACTIVE' ? { status: 'ACTIVE' as const }
        : mode === 'CLOSED' ? { status: { in: ['CLOSED', 'TERMINATED'] as ('CLOSED' | 'TERMINATED')[] }, actualEndAt: { gte: from, lt: to } }
        : { status: 'ACTIVE' as const, endAt: { lte: new Date(Date.now() + Math.min(365, Math.max(1, Number(filters.days) || 30)) * DAY) } };
      const rows = await tx.rentalContract.findMany({
        where: { ...branchOf(branchIds), ...where, ...(filters.kind ? { kind: filters.kind as never } : {}) },
        include: { customer: { select: { name: true } }, vehicles: { where: { endAt: null }, include: { vehicle: { select: { plate: true } } } } },
        orderBy: { endAt: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((c) => ({
        number: c.number, kind: CONTRACT_KIND_LABEL[c.kind], status: CONTRACT_STATUS_LABEL[c.status], customer: c.customer.name,
        plate: c.vehicles[0] ? formatPlate(c.vehicles[0].vehicle.plate) : null, startAt: iso(c.actualStartAt ?? c.startAt), endAt: iso(c.actualEndAt ?? c.endAt),
        monthly: money(c.monthlyAmount), total: money(c.totalAmount),
      }));
    },
  })),
  {
    key: 'reservations', title: 'Reservas', group: 'Locações', financial: false, period: true,
    description: 'Reservas com retirada no período, por situação.',
    permissions: ['reservations.view'],
    filters: [{ key: 'status', label: 'Situação', type: 'select', options: opts(RESERVATION_STATUS_LABEL) }],
    columns: [{ key: 'code', label: 'Reserva', type: 'text' }, { key: 'status', label: 'Situação', type: 'text' }, { key: 'customer', label: 'Cliente', type: 'text' }, { key: 'category', label: 'Categoria', type: 'text' }, PLATE_COL, { key: 'startAt', label: 'Retirada', type: 'datetime' }, { key: 'endAt', label: 'Devolução', type: 'datetime' }, { key: 'total', label: 'Valor', type: 'money' }],
    async run(tx, { from, to, branchIds, filters }) {
      const rows = await tx.reservation.findMany({
        where: { ...branchOf(branchIds), startAt: { gte: from, lt: to }, ...(filters.status ? { status: filters.status as never } : {}) },
        include: { customer: { select: { name: true } }, category: { select: { name: true } }, vehicle: { select: { plate: true } } },
        orderBy: { startAt: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((r) => ({ code: r.code, status: RESERVATION_STATUS_LABEL[r.status], customer: r.customer.name, category: r.category.name, plate: r.vehicle ? formatPlate(r.vehicle.plate) : null, startAt: iso(r.startAt), endAt: iso(r.endAt), total: money(r.total) }));
    },
  },

  /* ================= Financeiro ================= */
  {
    key: 'revenue', title: 'Receitas', group: 'Financeiro', financial: true, period: true,
    description: 'Pagamentos recebidos e confirmados no período (caução não entra: é obrigação a devolver).',
    permissions: ['finance.view'],
    filters: [{ key: 'kind', label: 'Tipo de título', type: 'select', options: opts(RECEIVABLE_KIND_LABEL) }],
    columns: [{ key: 'paidAt', label: 'Recebido em', type: 'datetime' }, { key: 'description', label: 'Título', type: 'text' }, { key: 'kind', label: 'Tipo', type: 'text' }, { key: 'customer', label: 'Cliente', type: 'text' }, { key: 'method', label: 'Forma', type: 'text' }, { key: 'amount', label: 'Valor', type: 'money' }, { key: 'reconciled', label: 'Conciliado', type: 'text' }],
    async run(tx, { from, to, branchIds, filters }) {
      const rows = await tx.payment.findMany({
        where: { direction: 'IN', status: 'CONFIRMED', paidAt: { gte: from, lt: to }, receivable: { ...branchOf(branchIds), ...(filters.kind ? { kind: filters.kind as never } : {}) } },
        include: { receivable: { include: { customer: { select: { name: true } } } } },
        orderBy: { paidAt: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((p) => ({ paidAt: iso(p.paidAt), description: p.receivable!.description, kind: RECEIVABLE_KIND_LABEL[p.receivable!.kind], customer: p.receivable!.customer?.name ?? null, method: PAYMENT_METHOD_LABEL[p.method], amount: num(p.amount), reconciled: p.reconciled ? 'Sim' : 'Não' }));
    },
  },
  {
    key: 'expenses', title: 'Despesas', group: 'Financeiro', financial: true, period: true,
    description: 'Contas a pagar com vencimento no período, por tipo e veículo.',
    permissions: ['finance.view'],
    filters: [{ key: 'kind', label: 'Tipo', type: 'select', options: opts(PAYABLE_KIND_LABEL) }],
    columns: [{ key: 'dueDate', label: 'Vencimento', type: 'date' }, { key: 'description', label: 'Descrição', type: 'text' }, { key: 'kind', label: 'Tipo', type: 'text' }, { key: 'supplier', label: 'Fornecedor', type: 'text' }, PLATE_COL, { key: 'amount', label: 'Valor', type: 'money' }, { key: 'status', label: 'Situação', type: 'text' }],
    async run(tx, { from, to, branchIds, filters }) {
      const rows = await tx.payable.findMany({
        where: { ...branchOf(branchIds), status: { not: 'CANCELLED' }, dueDate: { gte: from, lt: to }, ...(filters.kind ? { kind: filters.kind as never } : {}) },
        include: { supplier: { select: { name: true } }, vehicle: { select: { plate: true } } }, orderBy: { dueDate: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((p) => ({ dueDate: dateOnly(p.dueDate), description: p.description, kind: PAYABLE_KIND_LABEL[p.kind], supplier: p.supplier?.name ?? null, plate: p.vehicle ? formatPlate(p.vehicle.plate) : null, amount: num(p.amount), status: TITLE_STATUS_LABEL[p.status] }));
    },
  },
  {
    key: 'receivables', title: 'Contas a receber', group: 'Financeiro', financial: true, period: true,
    description: 'Títulos com vencimento no período, com valor pago e saldo.',
    permissions: ['finance.view'],
    filters: [{ key: 'status', label: 'Situação', type: 'select', options: opts(TITLE_STATUS_LABEL) }],
    columns: [{ key: 'dueDate', label: 'Vencimento', type: 'date' }, { key: 'description', label: 'Título', type: 'text' }, { key: 'customer', label: 'Cliente', type: 'text' }, { key: 'amount', label: 'Valor', type: 'money' }, { key: 'paid', label: 'Pago', type: 'money' }, { key: 'balance', label: 'Saldo', type: 'money' }, { key: 'status', label: 'Situação', type: 'text' }],
    async run(tx, { from, to, branchIds, filters }) {
      const rows = await tx.receivable.findMany({
        where: { ...branchOf(branchIds), dueDate: { gte: from, lt: to }, ...(filters.status ? { status: filters.status as never } : {}) },
        include: { customer: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((r) => ({ dueDate: dateOnly(r.dueDate), description: r.description, customer: r.customer?.name ?? null, amount: num(r.amount), paid: num(r.paidAmount), balance: fromCents(toCents(num(r.amount)) - toCents(num(r.paidAmount))), status: TITLE_STATUS_LABEL[r.status] }));
    },
  },
  {
    key: 'payables', title: 'Contas a pagar', group: 'Financeiro', financial: true, period: true,
    description: 'Contas a pagar no período com aprovação e saldo.',
    permissions: ['finance.view'],
    filters: [{ key: 'status', label: 'Situação', type: 'select', options: opts(TITLE_STATUS_LABEL) }],
    columns: [{ key: 'dueDate', label: 'Vencimento', type: 'date' }, { key: 'description', label: 'Descrição', type: 'text' }, { key: 'supplier', label: 'Fornecedor', type: 'text' }, { key: 'approval', label: 'Aprovação', type: 'text' }, { key: 'amount', label: 'Valor', type: 'money' }, { key: 'balance', label: 'Saldo', type: 'money' }, { key: 'status', label: 'Situação', type: 'text' }],
    async run(tx, { from, to, branchIds, filters }) {
      const rows = await tx.payable.findMany({
        where: { ...branchOf(branchIds), dueDate: { gte: from, lt: to }, ...(filters.status ? { status: filters.status as never } : {}) },
        include: { supplier: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((p) => ({ dueDate: dateOnly(p.dueDate), description: p.description, supplier: p.supplier?.name ?? null, approval: APPROVAL_STATUS_LABEL[p.approval], amount: num(p.amount), balance: fromCents(toCents(num(p.amount)) - toCents(num(p.paidAmount))), status: TITLE_STATUS_LABEL[p.status] }));
    },
  },
  {
    key: 'delinquency', title: 'Inadimplência', group: 'Financeiro', financial: true, period: false,
    description: 'Títulos vencidos em aberto, com dias de atraso e encargos calculados pelas regras da empresa.',
    permissions: ['finance.view'],
    filters: [],
    columns: [{ key: 'customer', label: 'Cliente', type: 'text' }, { key: 'description', label: 'Título', type: 'text' }, { key: 'dueDate', label: 'Vencimento', type: 'date' }, { key: 'daysLate', label: 'Dias de atraso', type: 'number' }, { key: 'balance', label: 'Saldo', type: 'money' }, { key: 'fine', label: 'Multa', type: 'money' }, { key: 'interest', label: 'Juros', type: 'money' }, { key: 'updated', label: 'Total atualizado', type: 'money' }],
    async run(tx, { organizationId, branchIds }) {
      const now = new Date();
      const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
      const settings = (org.settings ?? {}) as { lateFeePercent?: number; monthlyInterestPercent?: number };
      const rows = await tx.receivable.findMany({
        where: { ...branchOf(branchIds), status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: todayStart(now) } },
        include: { customer: { select: { name: true } }, contract: { select: { lateFeePercent: true, monthlyInterestPercent: true } } },
        orderBy: { dueDate: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((r) => {
        const balance = fromCents(toCents(num(r.amount)) - toCents(num(r.paidAmount)));
        const fineP = r.contract ? num(r.contract.lateFeePercent) : settings.lateFeePercent ?? 2;
        const intP = r.contract ? num(r.contract.monthlyInterestPercent) : settings.monthlyInterestPercent ?? 1;
        const c = lateCharges(balance, r.dueDate.toISOString().slice(0, 10), now, fineP, intP);
        return { customer: r.customer?.name ?? null, description: r.description, dueDate: dateOnly(r.dueDate), daysLate: c.days, balance, fine: c.fine, interest: c.interest, updated: fromCents(toCents(balance) + toCents(c.fine) + toCents(c.interest)) };
      });
    },
  },
  {
    key: 'deposits', title: 'Cauções', group: 'Financeiro', financial: true, period: false,
    description: 'Cauções por contrato: previsto, recebido, utilizado, devolvido e saldo — separados da receita.',
    permissions: ['deposits.view'],
    filters: [{ key: 'status', label: 'Situação', type: 'select', options: opts(DEPOSIT_STATUS_LABEL) }],
    columns: [{ key: 'contract', label: 'Contrato', type: 'text' }, { key: 'customer', label: 'Cliente', type: 'text' }, { key: 'status', label: 'Situação', type: 'text' }, { key: 'expected', label: 'Previsto', type: 'money' }, { key: 'received', label: 'Recebido', type: 'money' }, { key: 'used', label: 'Utilizado', type: 'money' }, { key: 'refunded', label: 'Devolvido', type: 'money' }, { key: 'available', label: 'Saldo', type: 'money' }],
    async run(tx, { branchIds, filters }) {
      const rows = await tx.securityDeposit.findMany({
        where: { ...(branchIds ? { contract: { branchId: { in: branchIds } } } : {}), ...(filters.status ? { status: filters.status as never } : {}) },
        include: { entries: true, contract: { select: { number: true } }, customer: { select: { name: true } } }, take: MAX_ROWS,
      });
      return rows.map((d) => {
        const b = depositBalance(d.entries.map((e) => ({ type: e.type, amount: num(e.amount), status: e.status })));
        return { contract: d.contract.number, customer: d.customer.name, status: DEPOSIT_STATUS_LABEL[d.status], expected: num(d.expectedAmount), received: b.received, used: b.used, refunded: b.refunded, available: b.available };
      });
    },
  },

  /* ================= Rentabilidade ================= */
  {
    key: 'profitability', title: 'Rentabilidade por veículo', group: 'Rentabilidade', financial: true, period: true,
    description: 'Receita, custos, resultado, margem, ocupação e custo por km — com aviso do que falta para fechar a conta.',
    permissions: ['fleet.view'],
    filters: [],
    columns: [PLATE_COL, { key: 'model', label: 'Modelo', type: 'text' }, { key: 'revenue', label: 'Receita', type: 'money' }, { key: 'costs', label: 'Custos', type: 'money' }, { key: 'result', label: 'Resultado', type: 'money' }, { key: 'margin', label: 'Margem', type: 'percent' }, { key: 'occupancy', label: 'Ocupação', type: 'percent' }, { key: 'costPerKm', label: 'Custo/km', type: 'money' }, { key: 'roi', label: 'ROI', type: 'percent' }, { key: 'missing', label: 'Dados faltantes', type: 'text' }],
    async run(tx, { organizationId, from, to, branchIds, deps }) {
      const rows = await deps.profitability.compute(tx, organizationId, { from, to, branchIds });
      return rows.sort((a, b) => b.operatingResult - a.operatingResult).map((r) => ({ plate: formatPlate(r.plate), model: r.model, revenue: r.revenue, costs: r.costs, result: r.operatingResult, margin: r.margin, occupancy: r.occupancy, costPerKm: r.costPerKm, roi: r.roi, missing: r.missing.join(', ') || null }));
    },
  },

  /* ================= Operação ================= */
  {
    key: 'maintenance', title: 'Manutenções', group: 'Operação', financial: false, period: true,
    description: 'Ordens de serviço concluídas no período, com custos de peças, mão de obra e terceiros.',
    permissions: ['maintenance.view'],
    filters: [],
    columns: [{ key: 'completedAt', label: 'Concluída em', type: 'datetime' }, { key: 'number', label: 'OS', type: 'text' }, PLATE_COL, { key: 'service', label: 'Serviço', type: 'text' }, { key: 'kind', label: 'Tipo', type: 'text' }, { key: 'parts', label: 'Peças', type: 'money' }, { key: 'labor', label: 'Mão de obra', type: 'money' }, { key: 'other', label: 'Outros', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }],
    async run(tx, { from, to, branchIds }) {
      const rows = await tx.workOrder.findMany({
        where: { ...branchOf(branchIds), status: 'COMPLETED', completedAt: { gte: from, lt: to } },
        include: { vehicle: { select: { plate: true } }, serviceType: { select: { name: true } } }, orderBy: { completedAt: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((w) => ({ completedAt: iso(w.completedAt), number: w.number, plate: formatPlate(w.vehicle.plate), service: w.serviceType.name, kind: w.kind === 'PREVENTIVE' ? 'Preventiva' : 'Corretiva', parts: num(w.partsCost), labor: num(w.laborCost), other: num(w.otherCost), total: fromCents(toCents(num(w.partsCost)) + toCents(num(w.laborCost)) + toCents(num(w.otherCost))) }));
    },
  },
  {
    key: 'work-orders', title: 'Ordens de serviço', group: 'Operação', financial: false, period: true,
    description: 'Todas as OS abertas no período, por situação e prioridade.',
    permissions: ['maintenance.view'],
    filters: [{ key: 'status', label: 'Situação', type: 'select', options: opts(WORK_ORDER_STATUS_LABEL) }],
    columns: [{ key: 'number', label: 'OS', type: 'text' }, { key: 'openedAt', label: 'Aberta em', type: 'datetime' }, PLATE_COL, { key: 'service', label: 'Serviço', type: 'text' }, { key: 'status', label: 'Situação', type: 'text' }, { key: 'dueAt', label: 'Prazo', type: 'datetime' }, { key: 'estimate', label: 'Orçamento', type: 'money' }],
    async run(tx, { from, to, branchIds, filters }) {
      const rows = await tx.workOrder.findMany({
        where: { ...branchOf(branchIds), openedAt: { gte: from, lt: to }, ...(filters.status ? { status: filters.status as never } : {}) },
        include: { vehicle: { select: { plate: true } }, serviceType: { select: { name: true } } }, orderBy: { openedAt: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((w) => ({ number: w.number, openedAt: iso(w.openedAt), plate: formatPlate(w.vehicle.plate), service: w.serviceType.name, status: WORK_ORDER_STATUS_LABEL[w.status], dueAt: iso(w.dueAt), estimate: money(w.estimateAmount) }));
    },
  },
  {
    key: 'parts-consumption', title: 'Consumo de peças', group: 'Operação', financial: false, period: true,
    description: 'Saídas de estoque no período por produto e veículo, com custo.',
    permissions: ['inventory.view'],
    filters: [],
    columns: [{ key: 'at', label: 'Data', type: 'datetime' }, { key: 'product', label: 'Produto', type: 'text' }, { key: 'type', label: 'Movimento', type: 'text' }, PLATE_COL, { key: 'quantity', label: 'Quantidade', type: 'number' }, { key: 'cost', label: 'Custo', type: 'money' }],
    async run(tx, { from, to, branchIds }) {
      const rows = await tx.inventoryMovement.findMany({
        where: { at: { gte: from, lt: to }, quantity: { lt: 0 }, type: { not: 'TRANSFER_OUT' }, ...(branchIds ? { OR: [{ vehicle: { branchId: { in: branchIds } } }, { vehicleUnitId: null }] } : {}) },
        include: { product: { select: { sku: true, description: true } }, vehicle: { select: { plate: true } } }, orderBy: { at: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((m) => ({ at: iso(m.at), product: `${m.product.sku} — ${m.product.description}`, type: MOVEMENT_TYPE_LABEL[m.type], plate: m.vehicle ? formatPlate(m.vehicle.plate) : null, quantity: Math.abs(num(m.quantity)), cost: Math.abs(num(m.totalCost)) }));
    },
  },
  {
    key: 'stock-minimum', title: 'Estoque mínimo', group: 'Operação', financial: false, period: false,
    description: 'Produtos abaixo do mínimo, com sugestão de reposição até o máximo.',
    permissions: ['inventory.view'],
    filters: [],
    columns: [{ key: 'sku', label: 'Código', type: 'text' }, { key: 'product', label: 'Produto', type: 'text' }, { key: 'balance', label: 'Saldo', type: 'number' }, { key: 'min', label: 'Mínimo', type: 'number' }, { key: 'max', label: 'Máximo', type: 'number' }, { key: 'suggested', label: 'Repor', type: 'number' }, { key: 'lastCost', label: 'Último custo', type: 'money' }],
    async run(tx) {
      const products = await tx.inventoryProduct.findMany({ where: { active: true, minStock: { gt: 0 } }, include: { balances: true }, take: MAX_ROWS });
      return products.map((p) => {
        const balance = p.balances.reduce((a, b) => a + num(b.quantity), 0);
        const min = num(p.minStock);
        const max = numOrNull(p.maxStock);
        return { sku: p.sku, product: p.description, balance, min, max, suggested: Math.max(0, (max ?? min * 2) - balance), lastCost: num(p.lastCost) };
      }).filter((p) => p.balance < p.min);
    },
  },
  {
    key: 'inventory', title: 'Inventário', group: 'Operação', financial: false, period: false,
    description: 'Saldo por produto e local, com valor pelo custo médio.',
    permissions: ['inventory.view'],
    filters: [],
    columns: [{ key: 'location', label: 'Local', type: 'text' }, { key: 'sku', label: 'Código', type: 'text' }, { key: 'product', label: 'Produto', type: 'text' }, { key: 'quantity', label: 'Saldo', type: 'number' }, { key: 'averageCost', label: 'Custo médio', type: 'money' }, { key: 'value', label: 'Valor', type: 'money' }],
    async run(tx, { branchIds }) {
      const rows = await tx.stockBalance.findMany({
        where: { ...(branchIds ? { location: { branchId: { in: branchIds } } } : {}), quantity: { not: 0 } },
        include: { product: { select: { sku: true, description: true, averageCost: true } }, location: { select: { name: true, branch: { select: { name: true } } } } }, take: MAX_ROWS,
      });
      return rows.map((b) => ({ location: `${b.location.branch.name} — ${b.location.name}`, sku: b.product.sku, product: b.product.description, quantity: num(b.quantity), averageCost: num(b.product.averageCost), value: Math.round(num(b.quantity) * num(b.product.averageCost) * 100) / 100 }));
    },
  },
  {
    key: 'inspections', title: 'Vistorias', group: 'Operação', financial: false, period: true,
    description: 'Vistorias do período por tipo, com avarias registradas.',
    permissions: ['inspections.view'],
    filters: [{ key: 'type', label: 'Tipo', type: 'select', options: opts(INSPECTION_TYPE_LABEL) }],
    columns: [{ key: 'number', label: 'Vistoria', type: 'text' }, { key: 'startedAt', label: 'Data', type: 'datetime' }, { key: 'type', label: 'Tipo', type: 'text' }, PLATE_COL, { key: 'status', label: 'Situação', type: 'text' }, { key: 'odometerKm', label: 'Km', type: 'number' }, { key: 'damages', label: 'Avarias', type: 'number' }],
    async run(tx, { from, to, branchIds, filters }) {
      const rows = await tx.inspection.findMany({
        where: { ...branchOf(branchIds), startedAt: { gte: from, lt: to }, ...(filters.type ? { type: filters.type as never } : {}) },
        include: { vehicle: { select: { plate: true } }, _count: { select: { damages: true } } }, orderBy: { startedAt: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((i) => ({ number: i.number, startedAt: iso(i.startedAt), type: INSPECTION_TYPE_LABEL[i.type], plate: formatPlate(i.vehicle.plate), status: INSPECTION_STATUS_LABEL[i.status], odometerKm: i.odometerKm, damages: i._count.damages }));
    },
  },

  /* ================= Regularização ================= */
  {
    key: 'infractions', title: 'Infrações', group: 'Regularização', financial: false, period: true,
    description: 'Infrações ocorridas no período com status administrativo e financeiro.',
    permissions: ['infractions.view'],
    filters: [{ key: 'adminStatus', label: 'Status administrativo', type: 'select', options: opts(INFRACTION_ADMIN_STATUS_LABEL) }],
    columns: [{ key: 'occurredAt', label: 'Data', type: 'datetime' }, { key: 'autoNumber', label: 'Auto', type: 'text' }, { key: 'authority', label: 'Órgão', type: 'text' }, PLATE_COL, { key: 'driver', label: 'Condutor', type: 'text' }, { key: 'admin', label: 'Administrativo', type: 'text' }, { key: 'financial', label: 'Financeiro', type: 'text' }, { key: 'amount', label: 'Valor', type: 'money' }, { key: 'dueDate', label: 'Vencimento', type: 'date' }],
    async run(tx, { from, to, branchIds, filters }) {
      const rows = await tx.trafficInfraction.findMany({
        where: { ...vehicleBranch(branchIds), occurredAt: { gte: from, lt: to }, ...(filters.adminStatus ? { adminStatus: filters.adminStatus as never } : {}) },
        include: { vehicle: { select: { plate: true } }, driver: { select: { name: true } } }, orderBy: { occurredAt: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((i) => ({ occurredAt: iso(i.occurredAt), autoNumber: i.autoNumber, authority: i.authority, plate: formatPlate(i.vehicle.plate), driver: i.driver?.name ?? null, admin: INFRACTION_ADMIN_STATUS_LABEL[i.adminStatus], financial: INFRACTION_FINANCIAL_STATUS_LABEL[i.financialStatus], amount: num(i.finalAmount), dueDate: dateOnly(i.dueDate) }));
    },
  },
  {
    key: 'claims', title: 'Sinistros', group: 'Regularização', financial: false, period: true,
    description: 'Sinistros ocorridos no período com custos estimados e indenizações.',
    permissions: ['claims.view'],
    filters: [{ key: 'status', label: 'Situação', type: 'select', options: opts(CLAIM_STATUS_LABEL) }],
    columns: [{ key: 'number', label: 'Sinistro', type: 'text' }, { key: 'occurredAt', label: 'Data', type: 'datetime' }, { key: 'type', label: 'Tipo', type: 'text' }, PLATE_COL, { key: 'status', label: 'Situação', type: 'text' }, { key: 'estimated', label: 'Custo estimado', type: 'money' }, { key: 'indemnity', label: 'Indenização', type: 'money' }],
    async run(tx, { from, to, branchIds, filters }) {
      const rows = await tx.claim.findMany({
        where: { ...branchOf(branchIds), occurredAt: { gte: from, lt: to }, ...(filters.status ? { status: filters.status as never } : {}) },
        include: { vehicle: { select: { plate: true } } }, orderBy: { occurredAt: 'asc' }, take: MAX_ROWS,
      });
      return rows.map((c) => ({ number: c.number, occurredAt: iso(c.occurredAt), type: CLAIM_TYPE_LABEL[c.type], plate: formatPlate(c.vehicle.plate), status: CLAIM_STATUS_LABEL[c.status], estimated: money(c.estimatedCost), indemnity: money(c.indemnityAmount) }));
    },
  },
];

export const REPORT_GROUPS = ['Frota', 'Locações', 'Financeiro', 'Operação', 'Regularização', 'Rentabilidade'] as const;
