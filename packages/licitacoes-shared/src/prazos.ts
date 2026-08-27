/* =========================================================
   Nexor Licitações — Prazos
   ---------------------------------------------------------
   O prazo é a variável que mais elimina fornecedor pequeno, e
   quase nunca por falta de preço: é por chegar tarde. Uma
   dispensa eletrônica costuma abrir e fechar em três dias
   úteis. Quem descobre no penúltimo dia não consegue emitir
   certidão vencida a tempo.

   Por isso o prazo entra na triagem como corte e como alerta,
   não como mera informação de tela.
   ========================================================= */

const HORA_MS = 60 * 60 * 1000;

export type Urgencia = 'encerrado' | 'critico' | 'apertado' | 'confortavel';

/**
 * Horas até o encerramento do recebimento de propostas.
 * `null` quando o órgão não publicou a data — acontece, e é
 * diferente de prazo zero: significa "confira no edital".
 */
export function horasAte(encerramento: string | null, agora: Date): number | null {
  if (!encerramento) return null;
  const fim = new Date(encerramento);
  if (Number.isNaN(fim.getTime())) return null;
  return (fim.getTime() - agora.getTime()) / HORA_MS;
}

/**
 * `diasMinimosPreparo` vem do perfil porque o limiar é da
 * empresa, não do sistema: quem já tem SICAF e certidões em dia
 * responde em um dia; quem precisa pedir balanço ao contador,
 * não.
 */
export function urgencia(horasRestantes: number | null, diasMinimosPreparo: number): Urgencia {
  if (horasRestantes === null) return 'apertado';
  if (horasRestantes <= 0) return 'encerrado';

  const horasNecessarias = diasMinimosPreparo * 24;
  if (horasRestantes < horasNecessarias / 2) return 'critico';
  if (horasRestantes < horasNecessarias) return 'apertado';
  return 'confortavel';
}

export function descreverPrazo(horasRestantes: number | null): string {
  if (horasRestantes === null) return 'prazo não publicado';
  if (horasRestantes <= 0) return 'encerrado';
  if (horasRestantes < 24) return `${Math.floor(horasRestantes)} h restantes`;
  const dias = Math.floor(horasRestantes / 24);
  return dias === 1 ? '1 dia restante' : `${dias} dias restantes`;
}

/**
 * Data no formato AAAAMMDD que o PNCP exige nos parâmetros de
 * consulta. Usa o fuso local de propósito: o recorte "próximos
 * 30 dias" é o do usuário, não o de UTC.
 */
export function paraFormatoPncp(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}${mes}${dia}`;
}

export function somarDias(data: Date, dias: number): Date {
  const nova = new Date(data.getTime());
  nova.setDate(nova.getDate() + dias);
  return nova;
}
