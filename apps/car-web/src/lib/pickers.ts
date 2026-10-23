/* =========================================================
   Carregadores dos seletores de entidade (EntityPicker).
   Um lugar só para o formato de cada busca: as telas de
   reserva, OS, infração e vistoria escolhem veículo, cliente
   ou motorista do mesmo jeito.

   Contratos dos endpoints (todos paginados, escopados por
   empresa e filial no servidor):
     GET /vehicles?q=&pageSize=      → Paginated<VehiclePick>
     GET /customers?q=&pageSize=     → Paginated<CustomerPick>
     GET /drivers?q=&customerId=     → Paginated<DriverPick>
     GET /suppliers?q=&kind=         → Paginated<SupplierPick>
     GET /contracts?q=&status=       → Paginated<ContractPick>
     GET /work-orders?q=&status=     → Paginated<WorkOrderPick>
     GET /inventory/products?q=      → Paginated<ProductPick>
   ========================================================= */
import { formatPlate } from '@nortycar/shared';
import { api } from './api';
import type { PickerOption } from '../components/picker';

export interface VehiclePick { id: string; plate: string; internalCode: string; branchId: string; model: { name: string; make: { name: string } }; color?: string; odometerKm?: number }
export interface CustomerPick { id: string; name: string; document: string; type: 'PF' | 'PJ'; status?: string }
export interface DriverPick { id: string; name: string; cpf: string; cnhExpiresAt: string; customerId?: string | null }
export interface SupplierPick { id: string; name: string; document?: string | null; kinds?: string[] }
export interface ContractPick { id: string; number: string; status: string; customer: { name: string } }
export interface WorkOrderPick { id: string; number: string; status: string; vehicle: { plate: string } }
export interface ProductPick { id: string; sku: string; description: string; unit: string }

const PAGE = { pageSize: 20 };

export const loadVehicles = (extra: Record<string, string> = {}) => async (q: string): Promise<PickerOption[]> =>
  (await api.page<VehiclePick>('/vehicles', { q, ...PAGE, ...extra })).items.map((v) => ({
    id: v.id, label: `${formatPlate(v.plate)} · ${v.model.make.name} ${v.model.name}`, description: `${v.internalCode}${v.color ? ` · ${v.color}` : ''}`,
  }));

export const loadCustomers = (extra: Record<string, string> = {}) => async (q: string): Promise<PickerOption[]> =>
  (await api.page<CustomerPick>('/customers', { q, ...PAGE, ...extra })).items.map((c) => ({ id: c.id, label: c.name, description: `${c.type} · ${c.document}` }));

export const loadDrivers = (extra: Record<string, string> = {}) => async (q: string): Promise<PickerOption[]> =>
  (await api.page<DriverPick>('/drivers', { q, ...PAGE, ...extra })).items.map((d) => ({ id: d.id, label: d.name, description: `CPF ${d.cpf}` }));

export const loadSuppliers = (extra: Record<string, string> = {}) => async (q: string): Promise<PickerOption[]> =>
  (await api.page<SupplierPick>('/suppliers', { q, ...PAGE, ...extra })).items.map((s) => ({ id: s.id, label: s.name, description: s.document ?? undefined }));

export const loadContracts = (extra: Record<string, string> = {}) => async (q: string): Promise<PickerOption[]> =>
  (await api.page<ContractPick>('/contracts', { q, ...PAGE, ...extra })).items.map((c) => ({ id: c.id, label: c.number, description: c.customer.name }));

export const loadWorkOrders = (extra: Record<string, string> = {}) => async (q: string): Promise<PickerOption[]> =>
  (await api.page<WorkOrderPick>('/work-orders', { q, ...PAGE, ...extra })).items.map((w) => ({ id: w.id, label: w.number, description: formatPlate(w.vehicle.plate) }));

export const loadProducts = (extra: Record<string, string> = {}) => async (q: string): Promise<PickerOption[]> =>
  (await api.page<ProductPick>('/inventory/products', { q, ...PAGE, ...extra })).items.map((p) => ({ id: p.id, label: p.description, description: `${p.sku} · ${p.unit}` }));
