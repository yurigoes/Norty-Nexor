/* Controle de acesso: histórico, registro e leitura simulada de placas. */

import { byId, insert, nextId, where } from '../data/repositories';
import type { AccessLog, Gate, ID, Vehicle } from '../data/types';
import { recordAudit } from './audit';
import { pushNotification } from './notifications';

export interface RegisterAccessInput {
  condominiumId: ID;
  unitId?: ID;
  subjectType: AccessLog['subjectType'];
  subjectId?: ID;
  subjectName: string;
  direction: AccessLog['direction'];
  gateId: ID;
  plate?: string;
  registeredBy: string;
  method: AccessLog['method'];
  authorized: boolean;
}

export function registerAccess(input: RegisterAccessInput): AccessLog {
  const gate = byId('gates', input.gateId);
  const log: AccessLog = {
    id: nextId('acc'),
    condominiumId: input.condominiumId,
    unitId: input.unitId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    direction: input.direction,
    gateId: input.gateId,
    gateName: gate?.name ?? 'Portaria',
    plate: input.plate,
    at: new Date().toISOString(),
    registeredBy: input.registeredBy,
    method: input.method,
    authorized: input.authorized,
  };
  insert('accessLogs', log);

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.registeredBy,
    actorRole: 'portaria',
    action: input.direction === 'entrada' ? 'Registrou entrada' : 'Registrou saída',
    target: input.subjectName,
    detail: `${log.gateName} · ${METHOD_LABEL[log.method]}`,
    module: 'Controle de acesso',
  });

  return log;
}

export function accessLogs(condominiumId: ID): AccessLog[] {
  return where('accessLogs', (a) => a.condominiumId === condominiumId);
}

export function accessLogsOfUnit(unitId: ID): AccessLog[] {
  return where('accessLogs', (a) => a.unitId === unitId);
}

export function accessesToday(condominiumId: ID, isoDate: string): AccessLog[] {
  return accessLogs(condominiumId).filter((a) => a.at.slice(0, 10) === isoDate);
}

export function recentAccesses(condominiumId: ID, limit = 12): AccessLog[] {
  return accessLogs(condominiumId).slice(0, limit);
}

/* ---------------- Portões ---------------- */

export function gates(condominiumId: ID): Gate[] {
  return where('gates', (g) => g.condominiumId === condominiumId);
}

export function openGate(gateId: ID, actorName: string): Gate | undefined {
  const gate = byId('gates', gateId);
  if (!gate || gate.status !== 'online') return undefined;
  const at = new Date().toISOString();
  const next = { ...gate, lastOpenedAt: at, lastOpenedBy: actorName };
  insert('gates', next);

  recordAudit({
    condominiumId: gate.condominiumId,
    actorName,
    actorRole: 'portaria',
    action: 'Abriu portão',
    target: gate.name,
    detail: 'Comando enviado pelo console da portaria',
    module: 'Portões',
  });

  return next;
}

/* ---------------- Leitura de placa (simulada) ---------------- */

export interface PlateReadResult {
  plate: string;
  vehicle?: Vehicle;
  authorized: boolean;
  reason: string;
}

/**
 * Simula o reconhecimento de placa (LPR).
 * Na Fase 4 esta função é substituída pela integração real com as
 * câmeras/controladoras — a assinatura permanece a mesma.
 */
export function readPlate(condominiumId: ID, plate: string): PlateReadResult {
  const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const vehicle = where('vehicles', (v) => v.condominiumId === condominiumId && v.plate === normalized)[0];

  if (!vehicle) {
    return { plate: normalized, authorized: false, reason: 'Placa não cadastrada no condomínio.' };
  }
  if (!vehicle.authorized) {
    return { plate: normalized, vehicle, authorized: false, reason: 'Veículo com autorização suspensa.' };
  }
  if (vehicle.validUntil && vehicle.validUntil < new Date().toISOString().slice(0, 10)) {
    return { plate: normalized, vehicle, authorized: false, reason: 'Autorização do veículo expirada.' };
  }
  return { plate: normalized, vehicle, authorized: true, reason: 'Placa reconhecida na base de veículos do condomínio.' };
}

export function confirmPlateEntry(condominiumId: ID, result: PlateReadResult, gateId: ID, registeredBy: string): AccessLog {
  const log = registerAccess({
    condominiumId,
    unitId: result.vehicle?.unitId,
    subjectType: 'veiculo',
    subjectId: result.vehicle?.id,
    subjectName: result.vehicle ? `${result.vehicle.brand} ${result.vehicle.model}` : 'Veículo não identificado',
    direction: 'entrada',
    gateId,
    plate: result.plate,
    registeredBy,
    method: 'placa',
    authorized: result.authorized,
  });

  if (result.vehicle?.unitId) {
    pushNotification({
      condominiumId,
      unitId: result.vehicle.unitId,
      kind: 'veiculo',
      title: 'Veículo detectado',
      body: `Seu veículo ${result.plate} entrou no condomínio pelo ${log.gateName}.`,
      link: '/app/acessos',
      refId: log.id,
    });
  }

  return log;
}

export const METHOD_LABEL: Record<AccessLog['method'], string> = {
  manual: 'Manual',
  qrcode: 'QR Code',
  placa: 'Leitura de placa',
  biometria: 'Biometria',
  tag: 'Tag de proximidade',
};

export const SUBJECT_LABEL: Record<AccessLog['subjectType'], string> = {
  morador: 'Morador',
  visitante: 'Visitante',
  veiculo: 'Veículo',
  prestador: 'Prestador',
  funcionario: 'Funcionário',
  entrega: 'Entrega',
};
