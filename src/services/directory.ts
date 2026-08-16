/* Consultas de estrutura física e pessoas: condomínios, torres,
   unidades, moradores e funcionários. */

import { all, byId, insert, nextId, update, where } from '../data/repositories';
import type { Condominium, ID, Resident, Staff, Tower, Unit, User } from '../data/types';

export function condominiumsFor(user: User): Condominium[] {
  const list = all('condominiums').filter((c) => c.tenantId === user.tenantId);
  if (user.role === 'administradora' || user.condominiumIds.length === 0) return list;
  return list.filter((c) => user.condominiumIds.includes(c.id));
}

export function condominium(id: ID): Condominium | undefined {
  return byId('condominiums', id);
}

export function towers(condominiumId: ID): Tower[] {
  return where('towers', (t) => t.condominiumId === condominiumId);
}

export function units(condominiumId: ID): Unit[] {
  return where('units', (u) => u.condominiumId === condominiumId);
}

export function unit(id: ID | undefined): Unit | undefined {
  return id ? byId('units', id) : undefined;
}

/** Rótulo canônico de uma unidade: "Torre A · Apto 1204". */
export function unitLabel(id: ID | undefined): string {
  const u = unit(id);
  if (!u) return '—';
  return `Torre ${u.block} · Apto ${u.label}`;
}

export function unitShort(id: ID | undefined): string {
  const u = unit(id);
  return u ? `${u.block}-${u.label}` : '—';
}

export function residents(condominiumId: ID): Resident[] {
  return where('residents', (r) => r.condominiumId === condominiumId);
}

export function residentsOfUnit(unitId: ID): Resident[] {
  return where('residents', (r) => r.unitId === unitId);
}

export function resident(id: ID | undefined): Resident | undefined {
  return id ? byId('residents', id) : undefined;
}

export function staffOfCondominium(condominiumId: ID): Staff[] {
  return where('staff', (s) => s.condominiumId === condominiumId);
}

export function staffOfUnit(unitId: ID): Staff[] {
  return where('staff', (s) => s.unitId === unitId);
}

export function saveStaff(payload: Omit<Staff, 'id'> & { id?: ID }): Staff {
  if (payload.id) {
    return update('staff', payload.id, payload) as Staff;
  }
  const entity: Staff = { ...payload, id: nextId('staff') };
  return insert('staff', entity);
}

export function searchDirectory(condominiumId: ID, term: string) {
  const q = term.trim().toLowerCase();
  if (q.length < 2) return { residents: [], units: [], vehicles: [], visitors: [], staff: [] };

  const matches = <T>(list: T[], fn: (item: T) => string[]) =>
    list.filter((item) => fn(item).some((v) => v?.toLowerCase().includes(q))).slice(0, 8);

  return {
    residents: matches(residents(condominiumId), (r) => [r.name, r.document, r.phone, r.email]),
    units: matches(units(condominiumId), (u) => [u.label, `${u.block}-${u.label}`, u.ownerName, ...u.parkingSpots]),
    vehicles: matches(where('vehicles', (v) => v.condominiumId === condominiumId), (v) => [v.plate, v.model, v.brand, v.ownerName]),
    visitors: matches(where('visitors', (v) => v.condominiumId === condominiumId), (v) => [v.name, v.document, v.code, v.vehiclePlate ?? '']),
    staff: matches(staffOfCondominium(condominiumId), (s) => [s.name, s.document, s.role, s.company ?? '']),
  };
}
