import { chamar } from './cliente';

// --- Acordos -----------------------------------------------------------

export type NivelView = {
  id: string;
  name: string;
  offsetSeconds: number;
  criteria: unknown;
  actions: unknown;
};

export type AcordoView = {
  id: string;
  name: string;
  kind: 'SLA' | 'OLA';
  target: 'TTO' | 'TTR';
  durationSeconds: number;
  isActive: boolean;
  calendar: { id: string; name: string; timezone: string } | null;
  levels: NivelView[];
  emUso: number;
  categorias: number;
};

export const listarAcordos = () => chamar<AcordoView[]>('/agreements');

export const criarAcordo = (dados: {
  name: string;
  kind: 'SLA' | 'OLA';
  target: 'TTO' | 'TTR';
  durationSeconds: number;
  calendarId?: string | null;
}) => chamar<AcordoView>('/agreements', { metodo: 'POST', corpo: dados });

export const editarAcordo = (
  id: string,
  dados: { name?: string; durationSeconds?: number; calendarId?: string | null; isActive?: boolean },
) => chamar<AcordoView>(`/agreements/${id}`, { metodo: 'PATCH', corpo: dados });

export const desativarAcordo = (id: string) =>
  chamar<void>(`/agreements/${id}`, { metodo: 'DELETE' });

// --- Calendários -------------------------------------------------------

export type SegmentoView = {
  id?: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type FeriadoView = {
  id: string;
  name: string;
  date: string;
  isRecurring: boolean;
};

export type CalendarioView = {
  id: string;
  name: string;
  timezone: string;
  segments: SegmentoView[];
  holidays: FeriadoView[];
  _count?: { agreements: number };
};

export const listarCalendarios = () => chamar<CalendarioView[]>('/calendars');

export const criarCalendario = (dados: {
  name: string;
  timezone?: string;
  segments?: SegmentoView[];
}) => chamar<CalendarioView>('/calendars', { metodo: 'POST', corpo: dados });

export const editarCalendario = (
  id: string,
  dados: { name?: string; timezone?: string; segments?: SegmentoView[] },
) => chamar<CalendarioView>(`/calendars/${id}`, { metodo: 'PATCH', corpo: dados });

export const criarFeriado = (
  calendarId: string,
  dados: { name: string; date: string; isRecurring?: boolean },
) => chamar<FeriadoView>(`/calendars/${calendarId}/feriados`, { metodo: 'POST', corpo: dados });

export const removerFeriado = (calendarId: string, id: string) =>
  chamar<void>(`/calendars/${calendarId}/feriados/${id}`, { metodo: 'DELETE' });

// --- Motivos de pendência ----------------------------------------------

export type MotivoView = {
  id: string;
  name: string;
  followupIntervalSeconds: number;
  followupsBeforeResolution: number;
  followupTemplate: string | null;
  isDefault: boolean;
  _count?: { tickets: number };
};

export const listarMotivos = () => chamar<MotivoView[]>('/pending-reasons');

export const criarMotivo = (dados: Partial<MotivoView> & { name: string }) =>
  chamar<MotivoView>('/pending-reasons', { metodo: 'POST', corpo: dados });

export const editarMotivo = (id: string, dados: Partial<MotivoView>) =>
  chamar<MotivoView>(`/pending-reasons/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerMotivo = (id: string) =>
  chamar<void>(`/pending-reasons/${id}`, { metodo: 'DELETE' });

// --- Categorias --------------------------------------------------------

export const criarCategoria = (dados: {
  name: string;
  parentId?: string | null;
  defaultTeamId?: string | null;
  defaultUrgency?: number | null;
  defaultAgreementIds?: string[];
}) => chamar<{ id: string }>('/categories', { metodo: 'POST', corpo: dados });

export const editarCategoria = (
  id: string,
  dados: {
    name?: string;
    defaultTeamId?: string | null;
    defaultUrgency?: number | null;
    isActive?: boolean;
    defaultAgreementIds?: string[];
  },
) => chamar<{ id: string }>(`/categories/${id}`, { metodo: 'PATCH', corpo: dados });

export const removerCategoria = (id: string) =>
  chamar<void>(`/categories/${id}`, { metodo: 'DELETE' });
