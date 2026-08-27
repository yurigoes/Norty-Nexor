/** Utilitários de data — pt-BR, sem dependências externas. */

export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function isoDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(1);
  return isoDate(d);
}

export function addMonths(iso: string, delta: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  return isoDate(d);
}

export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

export function monthLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${MONTHS[d.getMonth()].replace(/^./, (c) => c.toUpperCase())} ${d.getFullYear()}`;
}

/** '2026-08-16' -> '16/08/2026' */
export function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** ISO completo -> '16/08 14:32' */
export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${formatTime(iso)}`;
}

export function formatTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatLongDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

export function formatDayMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** Tempo relativo curto: 'agora', 'há 12 min', 'há 3 h', 'há 2 d'. */
export function timeAgo(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  return formatDate(iso);
}

export function daysUntil(iso: string, now = new Date()): number {
  const target = new Date(`${iso.slice(0, 10)}T12:00:00`).getTime();
  const base = new Date(`${isoDate(now)}T12:00:00`).getTime();
  return Math.round((target - base) / 86400000);
}
