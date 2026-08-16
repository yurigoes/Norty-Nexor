/** Formatação pt-BR compartilhada por toda a aplicação. */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL_COMPACT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const NUM = new Intl.NumberFormat('pt-BR');

export function currency(value: number): string {
  return BRL.format(value);
}

export function currencyCompact(value: number): string {
  return BRL_COMPACT.format(value);
}

export function number(value: number): string {
  return NUM.format(value);
}

export function percent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals).replace('.', ',')}%`;
}

export function plateMask(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}

export function fileSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${number(count)} ${count === 1 ? singular : plural}`;
}

const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function weekdays(days: number[]): string {
  if (days.length === 7) return 'Todos os dias';
  if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return 'Seg a Sex';
  return days.map((d) => WEEKDAY_LABEL[d]).join(' · ');
}
