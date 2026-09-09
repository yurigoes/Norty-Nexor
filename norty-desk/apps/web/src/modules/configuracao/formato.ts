/**
 * Segundos ↔ horas, num lugar só.
 *
 * A tela oferece horas porque é como se contrata SLA ("resolução em 8
 * horas"); a API guarda segundos porque é o que o cálculo usa. Duas
 * conversões espalhadas viram duas verdades sobre o mesmo prazo.
 */
export function segundosParaHoras(segundos: number): number {
  return Math.round((segundos / 3600) * 100) / 100;
}

export function horasParaSegundos(horas: number): number {
  return Math.round(horas * 3600);
}

/** `540` (minutos desde a meia-noite) vira `09:00`. */
export function minutosParaHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export const DIAS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

/** Um intervalo de cobrança legível: `259200` vira "3 dias". */
export function intervaloLegivel(segundos: number): string {
  if (segundos === 0) return 'não cobra';
  if (segundos % (24 * 3600) === 0) {
    const dias = segundos / (24 * 3600);
    return `${dias} dia${dias > 1 ? 's' : ''}`;
  }
  const horas = Math.round(segundos / 3600);
  return `${horas} hora${horas > 1 ? 's' : ''}`;
}
