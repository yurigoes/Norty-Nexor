/* =========================================================
   my Home — Endpoints da API
   ---------------------------------------------------------
   Uma função por operação, tipada pelos contratos de
   `@myhome/shared`. As telas chamam daqui e não montam URL
   nem cabeçalho por conta própria.

   Migração dos módulos: cada service em `src/services` troca a
   chamada aos repositories por estas funções, um módulo por vez.
   O modo de demonstração (`VITE_DATA_SOURCE=mock`) continua
   funcionando enquanto isso.
   ========================================================= */

import type {
  AppNotification, Delivery, Page, Professional, Reservation, Resident, ServiceRequest,
  Ticket, Unit, Visitor,
} from '@myhome/shared';
import { api } from './client';

export interface ListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  [key: string]: string | number | boolean | undefined;
}

/* ---------------- Diretório ---------------- */

export const directory = {
  towers: () => api.get<{ id: string; name: string; unitsCount: number }[]>('/towers'),
  units: (query?: ListQuery) => api.get<Page<Unit>>('/units', query),
  unit: (id: string) => api.get<Unit & { residents: Resident[] }>(`/units/${id}`),
  residents: (query?: ListQuery) => api.get<Page<Resident>>('/residents', query),
  /** Busca única da portaria: morador, unidade, placa ou visitante. */
  search: (q: string) =>
    api.get<{ residents: Resident[]; units: Unit[]; vehicles: unknown[]; visitors: Visitor[] }>(
      '/search',
      { q },
    ),
};

/* ---------------- Visitantes ---------------- */

export const visitors = {
  list: (query?: ListQuery) => api.get<Page<Visitor>>('/visitors', query),
  byCode: (code: string) => api.get<Visitor>(`/visitors/code/${encodeURIComponent(code)}`),
  create: (input: {
    name: string; document: string; phone?: string;
    kind: Visitor['kind']; category: Visitor['category'];
    expectedDate: string; expectedTime: string;
    validUntil?: string; recurrenceDays?: number[];
    notes?: string; vehiclePlate?: string; companyName?: string; unitId?: string;
  }) => api.post<Visitor>('/visitors', input),
  checkIn: (id: string) => api.post<Visitor>(`/visitors/${id}/check-in`),
  checkOut: (id: string) => api.post<Visitor>(`/visitors/${id}/check-out`),
  revoke: (id: string) => api.post<Visitor>(`/visitors/${id}/revoke`),
};

/* ---------------- Encomendas ---------------- */

export const deliveries = {
  list: (query?: ListQuery) => api.get<Page<Delivery>>('/deliveries', query),
  create: (input: {
    unitId: string; carrier: string; trackingCode: string;
    size: Delivery['size']; shelf: string; requiresSignature?: boolean; notes?: string;
  }) => api.post<Delivery>('/deliveries', input),
  pickup: (id: string, pickedUpBy: string) =>
    api.post<Delivery>(`/deliveries/${id}/pickup`, { pickedUpBy }),
};

/* ---------------- Reservas ---------------- */

export interface AvailabilityResponse {
  areaId: string;
  date: string;
  closed: boolean;
  slots: { slot: string; available: boolean }[];
}

export const reservations = {
  areas: () => api.get<{ id: string; name: string; kind: string; capacity: number; fee: number }[]>('/common-areas'),
  availability: (areaId: string, date: string) =>
    api.get<AvailabilityResponse>(`/common-areas/${areaId}/availability`, { date }),
  list: (query?: ListQuery) => api.get<Page<Reservation>>('/reservations', query),
  create: (input: { areaId: string; date: string; slot: string; guests: number; notes?: string; unitId?: string }) =>
    api.post<Reservation>('/reservations', input),
  approve: (id: string) => api.post<Reservation>(`/reservations/${id}/approve`),
  reject: (id: string, reason?: string) => api.post<Reservation>(`/reservations/${id}/reject`, { reason }),
  cancel: (id: string) => api.post<Reservation>(`/reservations/${id}/cancel`),
};

/* ---------------- Chamados ---------------- */

export const tickets = {
  list: (query?: ListQuery) => api.get<Page<Ticket>>('/tickets', query),
  detail: (id: string) => api.get<Ticket>(`/tickets/${id}`),
  create: (input: {
    category: string; location: string; title: string;
    description: string; priority: Ticket['priority']; unitId?: string;
  }) => api.post<Ticket>('/tickets', input),
  addUpdate: (id: string, input: { message: string; status?: Ticket['status']; assignedTo?: string }) =>
    api.post<Ticket>(`/tickets/${id}/updates`, input),
};

/* ---------------- Profissionais ---------------- */

export const professionals = {
  list: (query?: ListQuery & { category?: string; recommended?: boolean; emergency?: boolean; sort?: string }) =>
    api.get<Page<Professional>>('/professionals', query),
  categories: () => api.get<{ category: string; count: number }[]>('/professionals/categories'),
  detail: (id: string) => api.get<Professional & { reviews: unknown[] }>(`/professionals/${id}`),
  requests: (query?: ListQuery) => api.get<Page<ServiceRequest>>('/professionals/requests', query),
  requestQuote: (input: { professionalId: string; service: string; description: string; preferredDate?: string }) =>
    api.post<ServiceRequest>('/professionals/requests', input),
  review: (id: string, input: { rating: number; service: string; comment: string }) =>
    api.post<unknown>(`/professionals/${id}/reviews`, input),
  create: (input: {
    name: string; company?: string; category: Professional['category'];
    specialties?: string[]; phone: string; email?: string; bio?: string;
    serviceArea?: string; priceFrom?: number; emergency?: boolean;
  }) => api.post<Professional>('/professionals', input),
};

/* ---------------- Notificações ---------------- */

export const notifications = {
  list: (limit = 60) => api.get<AppNotification[]>('/notifications', { limit }),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ updated: number }>('/notifications/read-all'),
};

/* ---------------- Auditoria ---------------- */

export const audit = {
  list: (query?: ListQuery) => api.get<Page<unknown>>('/audit', query),
};
