/* Formatação pt-BR usada em exportações, impressões e textos gerados no servidor. */
import { formatDateBR, formatDateTimeBR } from '@nortycar/shared';

/** Data pura (meia-noite UTC) ou instante — sempre exibida no padrão brasileiro. */
export function date(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return formatDateBR(d.toISOString().slice(0, 10));
  }
  return formatDateBR(d);
}

export function dateTime(value: Date | string | null | undefined): string {
  return formatDateTimeBR(value ?? null);
}

const BRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function moneyPlain(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : BRL.format(value);
}
