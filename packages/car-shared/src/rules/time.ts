/* =========================================================
   Intervalos e datas.
   Datas e horas são gravadas em UTC (timestamptz) e exibidas
   no fuso da empresa. Intervalos são semiabertos [início, fim):
   devolver às 10h e retirar às 10h não é conflito.
   ========================================================= */

export interface Interval {
  start: Date;
  end: Date;
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Dias corridos entre duas datas, arredondando para baixo. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/** Soma meses preservando o dia, com o último dia do mês quando ele não existe. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1,
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result;
}

/** Competência no formato AAAA-MM. */
export function competenceOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Data (sem hora) em AAAA-MM-DD, no fuso informado. */
export function isoDateInZone(date: Date, timeZone = 'America/Sao_Paulo'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date);
  return parts;
}

export function formatDateBR(value: Date | string | null | undefined, timeZone = 'America/Sao_Paulo'): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  // Data pura (AAAA-MM-DD) não tem fuso: exibir no fuso local deslocaria um dia.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  return new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatDateTimeBR(value: Date | string | null | undefined, timeZone = 'America/Sao_Paulo'): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

/** Dias até uma data (negativo = já passou). */
export function daysUntil(target: Date | string, now = new Date()): number {
  const date = typeof target === 'string' ? new Date(target) : target;
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}
