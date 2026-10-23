/* Formatação pt-BR. Datas no padrão brasileiro, valores em reais. */
import { formatPlate } from '@nortycar/shared';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM = new Intl.NumberFormat('pt-BR');
const DEC = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const TZ = 'America/Sao_Paulo';

export const money = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : BRL.format(v));
export const int = (v: number | null | undefined) => (v === null || v === undefined ? '—' : NUM.format(v));
export const dec = (v: number | null | undefined) => (v === null || v === undefined ? '—' : DEC.format(v));
export const km = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${NUM.format(v)} km`);
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${DEC.format(v)}%`);
export const plate = (v: string | null | undefined) => (v ? formatPlate(v) : '—');

export function date(value: string | Date | null | undefined): string {
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  // Datas puras chegam como meia-noite UTC; exibir em UTC evita voltar um dia.
  if (typeof value === 'string' && /T00:00:00(\.000)?Z$/.test(value)) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function relative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = (d.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return date(d);
}

/** Valor de <input type="datetime-local"> no fuso de Brasília ↔ ISO UTC. */
export function toLocalInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  return parts.replace(' ', 'T');
}

export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  // Brasília não tem horário de verão desde 2019: UTC−3 fixo.
  return new Date(`${value}:00-03:00`).toISOString();
}

export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function initials(name: string | null | undefined): string {
  return (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${DEC.format(size / 1024)} KB`;
  return `${DEC.format(size / 1024 / 1024)} MB`;
}
