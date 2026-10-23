import { Badge } from '../../components/ui';
import { date } from '../../lib/format';

/** Dias até uma data pura (AAAA-MM-DD ou ISO à meia-noite UTC), no calendário de Brasília. */
export function daysTo(value: string): number {
  const target = new Date(`${value.slice(0, 10)}T03:00:00.000Z`).getTime();
  const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())}T03:00:00.000Z`).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** Selo de prazo: vermelho se venceu ou faltam 2 dias, âmbar até 7. */
export function deadlineBadge(label: string, value: string | null | undefined) {
  if (!value) return null;
  const left = daysTo(value);
  const tone = left <= 2 ? 'danger' : left <= 7 ? 'warning' : 'neutral';
  const text = left < 0 ? `venceu há ${-left} d` : left === 0 ? 'vence hoje' : `${left} d`;
  return <Badge tone={tone}>{label}: {date(value.slice(0, 10))} ({text})</Badge>;
}
