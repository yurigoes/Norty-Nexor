/* Agregações para dashboards. Toda leitura passa pelos services de
   domínio — nenhum componente acessa o banco diretamente. */

import { where } from '../data/repositories';
import type { Condominium, ID, Tenant } from '../data/types';
import { accessLogs, accessesToday } from './access';
import { pendingDeliveries } from './deliveries';
import { openTickets, tickets } from './tickets';
import { openIncidents } from './incidents';
import { reservationsOn } from './reservations';
import { expectedToday } from './visitors';
import { residents, units } from './directory';
import { financialSummary } from './finance';
import { isoDate } from '../lib/date';

export interface DashboardSnapshot {
  residents: number;
  units: number;
  vehicles: number;
  staff: number;
  accessesToday: number;
  expectedVisitors: number;
  pendingDeliveries: number;
  openTickets: number;
  openIncidents: number;
  reservationsToday: number;
  delinquencyRate: number;
  occupancyRate: number;
  onSiteVisitors: number;
}

export function dashboardSnapshot(condominiumId: ID, now = new Date()): DashboardSnapshot {
  const today = isoDate(now);
  const allUnits = units(condominiumId);
  const occupied = allUnits.filter((u) => u.status !== 'vaga');
  const summary = financialSummary(condominiumId, allUnits, today.slice(0, 7));

  return {
    residents: residents(condominiumId).length,
    units: allUnits.length,
    vehicles: where('vehicles', (v) => v.condominiumId === condominiumId).length,
    staff: where('staff', (s) => s.condominiumId === condominiumId && s.kind !== 'funcionario_unidade').length,
    accessesToday: accessesToday(condominiumId, today).length,
    expectedVisitors: expectedToday(condominiumId, today).length,
    pendingDeliveries: pendingDeliveries(condominiumId).length,
    openTickets: openTickets(condominiumId).length,
    openIncidents: openIncidents(condominiumId).length,
    reservationsToday: reservationsOn(condominiumId, today).length,
    delinquencyRate: summary.delinquencyRate,
    occupancyRate: allUnits.length ? (occupied.length / allUnits.length) * 100 : 0,
    onSiteVisitors: where('visitors', (v) => v.condominiumId === condominiumId && v.status === 'no_local').length,
  };
}

/** Fluxo de acessos por hora do dia atual. */
export function accessByHour(condominiumId: ID, now = new Date()) {
  const today = isoDate(now);
  const buckets = Array.from({ length: 24 }, () => ({ entradas: 0, saidas: 0 }));
  accessesToday(condominiumId, today).forEach((log) => {
    const hour = new Date(log.at).getHours();
    if (log.direction === 'entrada') buckets[hour].entradas += 1;
    else buckets[hour].saidas += 1;
  });
  return buckets.map((b, hour) => ({ label: `${String(hour).padStart(2, '0')}h`, ...b }));
}

/** Volume diário de acessos nos últimos N dias registrados. */
export function accessByDay(condominiumId: ID, days = 7) {
  const logs = accessLogs(condominiumId);
  const map = new Map<string, number>();
  logs.forEach((log) => {
    const day = log.at.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-days)
    .map(([date, count]) => ({ label: date.slice(8, 10) + '/' + date.slice(5, 7), value: count }));
}

export function accessByType(condominiumId: ID, now = new Date()) {
  const today = isoDate(now);
  const map = new Map<string, number>();
  accessesToday(condominiumId, today).forEach((log) => {
    map.set(log.subjectType, (map.get(log.subjectType) ?? 0) + 1);
  });
  return map;
}

/** Distribuição de chamados por categoria (últimos 90 dias). */
export function ticketsByCategory(condominiumId: ID) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const map = new Map<string, number>();
  tickets(condominiumId)
    .filter((t) => new Date(t.createdAt) >= cutoff)
    .forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + 1));
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

/** Chamados abertos x resolvidos por mês. */
export function ticketFlow(condominiumId: ID, months = 6, now = new Date()) {
  const list = tickets(condominiumId);
  const out: { label: string; abertos: number; resolvidos: number }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({
      label: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][d.getMonth()],
      abertos: list.filter((t) => t.createdAt.startsWith(prefix)).length,
      resolvidos: list.filter((t) => t.closedAt?.startsWith(prefix)).length,
    });
  }
  return out;
}

/* ---------------- Portfólio da administradora ---------------- */

export interface PortfolioSnapshot {
  condominiums: number;
  units: number;
  residents: number;
  vehicles: number;
  accessesToday: number;
  averageDelinquency: number;
  openTickets: number;
  monthlyRevenue: number;
}

export function portfolioSnapshot(tenant: Tenant, list: Condominium[]): PortfolioSnapshot {
  void tenant;
  const sum = (fn: (c: Condominium) => number) => list.reduce((s, c) => s + fn(c), 0);
  return {
    condominiums: list.length,
    units: sum((c) => c.unitsCount),
    residents: sum((c) => c.residentsCount),
    vehicles: sum((c) => c.vehiclesCount),
    accessesToday: sum((c) => c.metrics.accessesToday),
    averageDelinquency: list.length ? sum((c) => c.metrics.delinquencyRate) / list.length : 0,
    openTickets: sum((c) => c.metrics.openTickets),
    monthlyRevenue: sum((c) => c.metrics.monthlyRevenue),
  };
}
