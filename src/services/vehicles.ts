/* Veículos vinculados a moradores, visitantes, prestadores e funcionários. */

import { byId, insert, nextId, update, where } from '../data/repositories';
import type { ID, Vehicle } from '../data/types';
import { recordAudit } from './audit';
import { unitLabel } from './directory';

export function vehicles(condominiumId: ID): Vehicle[] {
  return where('vehicles', (v) => v.condominiumId === condominiumId);
}

export function vehiclesOfUnit(unitId: ID): Vehicle[] {
  return where('vehicles', (v) => v.unitId === unitId);
}

export function findByPlate(condominiumId: ID, plate: string): Vehicle | undefined {
  const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return vehicles(condominiumId).find((v) => v.plate === normalized);
}

export interface SaveVehicleInput {
  id?: ID;
  condominiumId: ID;
  unitId?: ID;
  ownerId?: ID;
  ownerName: string;
  ownerKind: Vehicle['ownerKind'];
  plate: string;
  brand: string;
  model: string;
  color: string;
  kind: Vehicle['kind'];
  parkingSpot?: string;
  validUntil?: string;
  actorName: string;
}

export class VehicleError extends Error {}

export function saveVehicle(input: SaveVehicleInput): Vehicle {
  const plate = input.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (plate.length < 7) throw new VehicleError('Informe uma placa válida (7 caracteres).');

  const duplicate = findByPlate(input.condominiumId, plate);
  if (duplicate && duplicate.id !== input.id) {
    throw new VehicleError(`A placa ${plate} já está cadastrada para ${duplicate.ownerName}.`);
  }

  if (input.id) {
    const next = update('vehicles', input.id, { ...input, plate }) as Vehicle;
    recordAudit({
      condominiumId: input.condominiumId,
      actorName: input.actorName,
      actorRole: 'morador',
      action: 'Atualizou veículo',
      target: plate,
      detail: `${input.brand} ${input.model}`,
      module: 'Veículos',
    });
    return next;
  }

  const vehicle: Vehicle = {
    id: nextId('veh'),
    condominiumId: input.condominiumId,
    unitId: input.unitId,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    ownerKind: input.ownerKind,
    plate,
    brand: input.brand,
    model: input.model,
    color: input.color,
    kind: input.kind,
    parkingSpot: input.parkingSpot,
    validUntil: input.validUntil,
    authorized: true,
    createdAt: new Date().toISOString(),
  };
  insert('vehicles', vehicle);

  recordAudit({
    condominiumId: input.condominiumId,
    actorName: input.actorName,
    actorRole: 'morador',
    action: 'Cadastrou veículo',
    target: plate,
    detail: `${input.brand} ${input.model} · ${input.unitId ? unitLabel(input.unitId) : 'Sem unidade'}`,
    module: 'Veículos',
  });

  return vehicle;
}

export function toggleVehicleAuthorization(id: ID, actorName: string): Vehicle | undefined {
  const vehicle = byId('vehicles', id);
  if (!vehicle) return undefined;
  const next = update('vehicles', id, { authorized: !vehicle.authorized });
  recordAudit({
    condominiumId: vehicle.condominiumId,
    actorName,
    actorRole: 'morador',
    action: vehicle.authorized ? 'Suspendeu veículo' : 'Reativou veículo',
    target: vehicle.plate,
    module: 'Veículos',
  });
  return next;
}

export const VEHICLE_KIND_LABEL: Record<Vehicle['kind'], string> = {
  carro: 'Carro',
  moto: 'Moto',
  utilitario: 'Utilitário',
  bicicleta: 'Bicicleta',
};

export const OWNER_KIND_LABEL: Record<Vehicle['ownerKind'], string> = {
  morador: 'Morador',
  visitante: 'Visitante',
  prestador: 'Prestador',
  funcionario: 'Funcionário',
};
