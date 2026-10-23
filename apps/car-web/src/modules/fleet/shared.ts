/* Tipos e cargas comuns às telas de frota. */
import { FUEL_TYPE_LABEL, TRANSMISSION_LABEL } from '@nortycar/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';

export interface CategoryRow { id: string; code: string; name: string; description: string | null; active: boolean; _count: { models: number; units: number } }
export interface ModelRow {
  id: string; name: string; categoryId: string; makeId: string; bodyType: string | null; seats: number | null; doors: number | null;
  trunkLiters: number | null; tankLiters: number | null; description: string | null; specs: Record<string, unknown>; hotspots: unknown[];
  coverFileId: string | null; model3dFileId: string | null; publicVisible: boolean; active: boolean;
  make: { id: string; name: string }; category: { id: string; name: string }; _count: { versions: number };
  unitCount: number; availableCount: number; colors: string[];
}
export interface VersionRow { id: string; name: string; engine: string | null; fuel: string | null; transmission: string | null; modelId: string }

export const FUEL_OPTIONS = Object.entries(FUEL_TYPE_LABEL).map(([value, label]) => ({ value, label }));
export const TRANSMISSION_OPTIONS = Object.entries(TRANSMISSION_LABEL).map(([value, label]) => ({ value, label }));

export function useCategories() {
  return useApi(() => api.get<CategoryRow[]>('/catalog/categories'), []);
}

export function useModels() {
  return useApi(() => api.get<ModelRow[]>('/catalog/models'), []);
}

export const VEHICLE_DOC_CATEGORIES = [
  { value: 'CRLV', label: 'CRLV' },
  { value: 'Apólice', label: 'Apólice de seguro' },
  { value: 'Nota fiscal', label: 'Nota fiscal' },
  { value: 'Laudo', label: 'Laudo' },
  { value: 'Outro', label: 'Outro' },
];

/** Converte "AAAA-MM-DD" (ou ISO) para o valor de <input type="date">. */
export function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}
