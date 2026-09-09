import type { Recorrencia } from '@norty-desk/shared';

import { componentesNoFuso, instanteLocal } from '../sla/calendario';

/**
 * Teto de varredura.
 *
 * Uma anual pode estar a 366 dias; 800 cobre isso com folga e garante
 * que uma recorrência impossível — semanal sem nenhum dia marcado —
 * termine em `null` em vez de rodar para sempre.
 */
const MAX_DIAS = 800;

/** Quantos dias tem o mês, no calendário gregoriano. */
function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * O dia do mês em que a recorrência cai.
 *
 * "Todo dia 31" em fevereiro vira 28 (ou 29). Pular o mês seria pior
 * que antecipar um dia: a manutenção mensal deixaria de existir em
 * fevereiro, e ninguém repararia até faltar o relatório.
 */
function diaEfetivo(ano: number, mes: number, diaPedido: number): number {
  return Math.min(diaPedido, diasNoMes(ano, mes));
}

function caiNesteDia(
  r: Recorrencia,
  dia: { ano: number; mes: number; dia: number; weekday: number },
): boolean {
  switch (r.tipo) {
    case 'DIARIA':
      return true;
    case 'SEMANAL':
      return r.diasDaSemana.includes(dia.weekday);
    case 'MENSAL':
      return dia.dia === diaEfetivo(dia.ano, dia.mes, r.diaDoMes);
    case 'ANUAL':
      return dia.mes === r.mes && dia.dia === diaEfetivo(dia.ano, dia.mes, r.diaDoMes);
  }
}

/**
 * A próxima ocorrência **estritamente depois** de `depoisDe`.
 *
 * Varre dia a dia no fuso da agenda em vez de somar intervalos. Somar
 * é o que o GLPI faz — periodicidade em segundos — e é o que faz uma
 * agenda semanal derrapar para outro dia da semana no horário de verão,
 * e uma mensal escorregar do dia 31 para o dia 1º. Aqui cada candidato
 * é uma data local convertida para instante, e o horário de verão é
 * problema do `Intl`, que sabe resolvê-lo.
 *
 * Devolve `null` quando a recorrência nunca dispara (semanal sem
 * nenhum dia marcado) ou quando passou de `ate`.
 */
export function proximaOcorrencia(
  recorrencia: Recorrencia,
  timezone: string,
  depoisDe: Date,
  ate?: Date | null,
): Date | null {
  const inicio = componentesNoFuso(depoisDe, timezone);
  // Meio-dia UTC como âncora: somar 24h a partir daí nunca pula nem
  // repete um dia local, mesmo na virada do horário de verão.
  const base = Date.UTC(inicio.ano, inicio.mes - 1, inicio.dia, 12);
  const minutosDoDia = recorrencia.hora * 60 + recorrencia.minuto;

  for (let i = 0; i < MAX_DIAS; i += 1) {
    const cursor = new Date(base + i * 86_400_000);
    const dia = {
      ano: cursor.getUTCFullYear(),
      mes: cursor.getUTCMonth() + 1,
      dia: cursor.getUTCDate(),
      weekday: cursor.getUTCDay(),
    };

    if (!caiNesteDia(recorrencia, dia)) continue;

    const instante = instanteLocal(dia.ano, dia.mes, dia.dia, minutosDoDia, timezone);

    if (instante.getTime() <= depoisDe.getTime()) continue;
    if (ate && instante.getTime() > ate.getTime()) return null;
    return instante;
  }

  return null;
}
