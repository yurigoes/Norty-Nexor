/**
 * Cálculo de prazo sobre calendário de expediente.
 *
 * Equivale a `LevelAgreement::computeExecutionDate()` do GLPI: um prazo
 * é medido em segundos de expediente, não de relógio. Um TTR de 4 horas
 * aberto às 17h de uma sexta, num calendário 9h-18h de segunda a sexta,
 * vence às 12h da segunda seguinte.
 *
 * Ver `docs/05-sla.md`, seção 3.
 */

export type FaixaExpediente = {
  /** 0 = domingo .. 6 = sábado */
  weekday: number;
  /** Minutos desde a meia-noite, no fuso do calendário. */
  startMinute: number;
  endMinute: number;
};

export type Feriado = {
  /** Data no fuso do calendário. */
  date: Date;
  isRecurring: boolean;
};

export type Calendario = {
  timezone: string;
  segments: FaixaExpediente[];
  holidays: Feriado[];
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;
/** Teto de segurança: nenhum prazo atravessa mais de dois anos de agenda. */
const MAX_DIAS_VARRIDOS = 730;

/**
 * Componentes de uma data no fuso do calendário.
 *
 * Usa `Intl` em vez de aritmética de offset porque o Brasil já teve
 * horário de verão e pode voltar a ter; offset fixo erraria duas vezes
 * por ano.
 */
function componentesNoFuso(data: Date, timezone: string) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(data);

  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '0';
  const diasDaSemana: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    ano: Number(valor('year')),
    mes: Number(valor('month')),
    dia: Number(valor('day')),
    // '24' aparece à meia-noite em algumas plataformas.
    hora: Number(valor('hour')) % 24,
    minuto: Number(valor('minute')),
    segundo: Number(valor('second')),
    weekday: diasDaSemana[valor('weekday')] ?? 0,
  };
}

/** Deslocamento do fuso, em minutos, no instante dado. */
function offsetMinutos(data: Date, timezone: string): number {
  const c = componentesNoFuso(data, timezone);
  const comoUtc = Date.UTC(c.ano, c.mes - 1, c.dia, c.hora, c.minuto, c.segundo);
  return (comoUtc - Math.floor(data.getTime() / 1000) * 1000) / 60000;
}

/** Instante UTC correspondente a uma hora local do calendário. */
function instanteLocal(
  ano: number, mes: number, dia: number, minutosDoDia: number, timezone: string,
): Date {
  const palpite = new Date(Date.UTC(ano, mes - 1, dia, 0, minutosDoDia, 0));
  // Duas passadas convergem mesmo na virada do horário de verão.
  const primeiro = new Date(palpite.getTime() - offsetMinutos(palpite, timezone) * 60000);
  return new Date(palpite.getTime() - offsetMinutos(primeiro, timezone) * 60000);
}

function ehFeriado(c: { ano: number; mes: number; dia: number }, feriados: Feriado[]): boolean {
  return feriados.some((f) => {
    const mes = f.date.getUTCMonth() + 1;
    const dia = f.date.getUTCDate();
    if (f.isRecurring) return mes === c.mes && dia === c.dia;
    return f.date.getUTCFullYear() === c.ano && mes === c.mes && dia === c.dia;
  });
}

/**
 * As faixas de expediente de um dia, como instantes UTC, em ordem.
 * Devolve lista vazia em fim de semana, feriado ou dia sem faixa.
 */
function faixasDoDia(
  referencia: Date, calendario: Calendario,
): { inicio: Date; fim: Date }[] {
  const c = componentesNoFuso(referencia, calendario.timezone);
  if (ehFeriado(c, calendario.holidays)) return [];

  return calendario.segments
    .filter((s) => s.weekday === c.weekday && s.endMinute > s.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((s) => ({
      inicio: instanteLocal(c.ano, c.mes, c.dia, s.startMinute, calendario.timezone),
      fim: instanteLocal(c.ano, c.mes, c.dia, s.endMinute, calendario.timezone),
    }));
}

/** Calendário sem faixas significa 24x7 — o comportamento certo para plantão. */
function ehVintQuatroPorSete(calendario: Calendario | null): calendario is null {
  return calendario === null || calendario.segments.length === 0;
}

/**
 * Vencimento de um prazo de `duracaoSegundos` a partir de `inicio`,
 * contando apenas expediente.
 */
export function calcularVencimento(
  inicio: Date,
  duracaoSegundos: number,
  calendario: Calendario | null,
): Date {
  if (duracaoSegundos <= 0) return new Date(inicio);
  if (ehVintQuatroPorSete(calendario)) {
    return new Date(inicio.getTime() + duracaoSegundos * 1000);
  }

  let restanteMs = duracaoSegundos * 1000;
  let cursor = new Date(inicio);

  for (let dia = 0; dia <= MAX_DIAS_VARRIDOS; dia += 1) {
    for (const faixa of faixasDoDia(cursor, calendario)) {
      if (faixa.fim <= cursor) continue;
      const entrada = faixa.inicio > cursor ? faixa.inicio : cursor;
      const disponivelMs = faixa.fim.getTime() - entrada.getTime();

      if (disponivelMs >= restanteMs) {
        return new Date(entrada.getTime() + restanteMs);
      }
      restanteMs -= disponivelMs;
    }
    // Próximo dia, à meia-noite local.
    const c = componentesNoFuso(cursor, calendario.timezone);
    cursor = instanteLocal(c.ano, c.mes, c.dia, 0, calendario.timezone);
    cursor = new Date(cursor.getTime() + MS_POR_DIA);
    // Reancora na meia-noite local do dia seguinte (corrige horário de verão).
    const d = componentesNoFuso(cursor, calendario.timezone);
    cursor = instanteLocal(d.ano, d.mes, d.dia, 0, calendario.timezone);
  }

  throw new Error(
    `Prazo de ${duracaoSegundos}s não cabe em ${MAX_DIAS_VARRIDOS} dias de agenda. ` +
      'O calendário provavelmente não tem faixas de expediente úteis.',
  );
}

/**
 * Segundos de expediente entre dois instantes.
 *
 * É o que desconta a pendência: um chamado parado da sexta à noite até a
 * segunda de manhã ganha zero, não sessenta horas
 * (`docs/05-sla.md`, seção 4).
 */
export function segundosDeExpediente(
  inicio: Date,
  fim: Date,
  calendario: Calendario | null,
): number {
  if (fim <= inicio) return 0;
  if (ehVintQuatroPorSete(calendario)) {
    return Math.floor((fim.getTime() - inicio.getTime()) / 1000);
  }

  let totalMs = 0;
  let cursor = new Date(inicio);

  for (let dia = 0; dia <= MAX_DIAS_VARRIDOS && cursor < fim; dia += 1) {
    for (const faixa of faixasDoDia(cursor, calendario)) {
      const entrada = faixa.inicio > cursor ? faixa.inicio : cursor;
      const saida = faixa.fim < fim ? faixa.fim : fim;
      if (saida > entrada) totalMs += saida.getTime() - entrada.getTime();
    }
    const c = componentesNoFuso(cursor, calendario.timezone);
    const meiaNoite = instanteLocal(c.ano, c.mes, c.dia, 0, calendario.timezone);
    const seguinte = new Date(meiaNoite.getTime() + MS_POR_DIA);
    const d = componentesNoFuso(seguinte, calendario.timezone);
    cursor = instanteLocal(d.ano, d.mes, d.dia, 0, calendario.timezone);
  }

  return Math.floor(totalMs / 1000);
}
