/* Peças comuns das telas de locação: categorias, disponibilidade e rótulos. */
import { CONTRACT_KIND_LABEL, type ContractKind } from '@nortycar/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { Badge } from '../../components/ui';

export interface CategoryOption { id: string; name: string; code?: string }

/** Aceita lista pura ou paginada: o catálogo é de outro módulo e o formato pode variar. */
export function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const v = value as { items?: T[]; units?: T[]; vehicles?: T[] } | null;
  return v?.items ?? v?.units ?? v?.vehicles ?? [];
}

export function useCategories() {
  return useApi(async () => asList<CategoryOption>(await api.get('/catalog/categories')), []);
}

export interface AvailableUnit {
  id: string;
  plate: string;
  color?: string;
  odometerKm?: number;
  branchId?: string;
  model?: { name: string; make?: { name: string } };
}

export async function loadAvailable(params: { startAt: string; endAt: string; categoryId: string; branchId: string }): Promise<AvailableUnit[]> {
  return asList<AvailableUnit>(await api.get('/availability', params));
}

export function KindBadge({ kind }: { kind: ContractKind }) {
  return <Badge tone={kind === 'LONG_TERM' ? 'brand' : 'info'}>{CONTRACT_KIND_LABEL[kind]}</Badge>;
}

export function modelName(m?: { name: string; make?: { name: string } } | null): string {
  if (!m) return '—';
  return `${m.make?.name ?? ''} ${m.name}`.trim();
}

/** Link para criar a vistoria vinculada (módulo de vistorias). */
export function inspectionLink(type: 'DELIVERY' | 'RETURN' | 'DRIVER_CHANGE', contractId: string, vehicleUnitId: string): string {
  return `/operacao/vistorias/nova?type=${type}&contractId=${contractId}&vehicleUnitId=${vehicleUnitId}`;
}
