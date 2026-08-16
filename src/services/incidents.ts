/* Ocorrências do condomínio. */

import { byId, insert, nextId, update, where } from '../data/repositories';
import type { ID, Incident, IncidentSeverity, IncidentStatus, UserRole } from '../data/types';
import { pushNotification } from './notifications';
import { recordAudit } from './audit';

export function incidents(condominiumId: ID): Incident[] {
  return where('incidents', (i) => i.condominiumId === condominiumId);
}

export function incidentsOfUnit(unitId: ID): Incident[] {
  return where('incidents', (i) => i.unitId === unitId);
}

export function openIncidents(condominiumId: ID): Incident[] {
  return incidents(condominiumId).filter((i) => i.status !== 'encerrada');
}

export interface CreateIncidentInput {
  condominiumId: ID;
  unitId?: ID;
  type: Incident['type'];
  title: string;
  description: string;
  severity: IncidentSeverity;
  location: string;
  involved: string[];
  reportedBy: string;
  reporterRole: UserRole;
  attachments: Incident['attachments'];
}

export function createIncident(input: CreateIncidentInput): Incident {
  const now = new Date().toISOString();
  const sequence = incidents(input.condominiumId).length + 1250;
  const incident: Incident = {
    id: nextId('inc'),
    condominiumId: input.condominiumId,
    unitId: input.unitId,
    code: `OC-${String(sequence).padStart(5, '0')}`,
    type: input.type,
    title: input.title,
    description: input.description,
    severity: input.severity,
    status: 'registrada',
    location: input.location,
    reportedBy: input.reportedBy,
    involved: input.involved,
    createdAt: now,
    actions: [{ id: nextId('ia'), at: now, author: input.reportedBy, message: 'Ocorrência registrada.' }],
    attachments: input.attachments,
  };
  insert('incidents', incident);

  pushNotification({
    condominiumId: input.condominiumId,
    role: 'sindico',
    kind: 'ocorrencia',
    title: 'Nova ocorrência registrada',
    body: `${incident.code} · ${incident.title} — ${incident.location}`,
    link: '/gestao/ocorrencias',
    refId: incident.id,
  });

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.reportedBy,
    actorRole: input.reporterRole,
    action: 'Registrou ocorrência',
    target: `${incident.code} · ${incident.title}`,
    detail: incident.location,
    module: 'Ocorrências',
  });

  return incident;
}

export function addIncidentAction(id: ID, author: string, message: string, status?: IncidentStatus): Incident | undefined {
  const incident = byId('incidents', id);
  if (!incident) return undefined;
  const actions = [...incident.actions, { id: nextId('ia'), at: new Date().toISOString(), author, message }];
  const next = update('incidents', id, { actions, status: status ?? incident.status });

  recordAudit({
    condominiumId: incident.condominiumId,
    actorName: author,
    actorRole: 'sindico',
    action: status === 'encerrada' ? 'Encerrou ocorrência' : 'Atualizou ocorrência',
    target: incident.code,
    detail: message,
    module: 'Ocorrências',
  });

  return next;
}

export const INCIDENT_TYPE_LABEL: Record<Incident['type'], string> = {
  barulho: 'Barulho',
  danos: 'Danos ao patrimônio',
  acidente: 'Acidente',
  seguranca: 'Segurança',
  estrutural: 'Problema estrutural',
  regras: 'Descumprimento de regras',
  outros: 'Outros',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  registrada: 'Registrada',
  em_analise: 'Em análise',
  notificada: 'Notificada',
  encerrada: 'Encerrada',
};

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

export function severityTone(severity: IncidentSeverity) {
  switch (severity) {
    case 'critica': return 'danger' as const;
    case 'alta': return 'warning' as const;
    case 'media': return 'info' as const;
    default: return 'neutral' as const;
  }
}

export function incidentTone(status: IncidentStatus) {
  switch (status) {
    case 'registrada': return 'warning' as const;
    case 'em_analise': return 'info' as const;
    case 'notificada': return 'brand' as const;
    default: return 'success' as const;
  }
}
