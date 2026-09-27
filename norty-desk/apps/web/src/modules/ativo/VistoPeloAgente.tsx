import { DIAS_PARA_SUMIDO, diasSemReportar } from '@norty-desk/shared';

import { dataCurta } from '../../lib/formato';

/**
 * Quando o agente falou desta máquina pela última vez.
 *
 * Mostra "há N dias" e não a data: a data exige que quem lê faça a
 * conta, e é a conta que decide se aquilo é normal ou se a máquina
 * sumiu. A data completa e a versão do agente ficam no `title`, para
 * quem for atrás — a primeira pergunta quando uma máquina reporta coisa
 * estranha é qual agente está nela.
 *
 * Máquina nunca varrida não é falha: impressora e switch entram à mão e
 * nunca vão reportar. Por isso um traço discreto, e não um aviso.
 *
 * Fica num arquivo próprio porque a listagem e a ficha mostram a mesma
 * coisa, e o limite do que conta como "sumida" não pode divergir entre
 * as duas.
 */
export function VistoPeloAgente({
  lastSeenAt,
  agentVersion,
}: {
  lastSeenAt: string | null;
  agentVersion: string | null;
}) {
  const dias = diasSemReportar(lastSeenAt);

  if (dias === null || !lastSeenAt) {
    return (
      <span className="campo-ajuda" title="Nenhum agente varreu esta máquina.">
        —
      </span>
    );
  }

  const texto = dias === 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
  const completa = `${dataCurta(lastSeenAt)}${agentVersion ? ` · agente ${agentVersion}` : ''}`;

  return dias >= DIAS_PARA_SUMIDO ? (
    <span className="selo -aviso" title={completa}>
      {texto}
    </span>
  ) : (
    <span title={completa}>{texto}</span>
  );
}
