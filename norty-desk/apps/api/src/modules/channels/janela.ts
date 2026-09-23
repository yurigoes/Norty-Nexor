/**
 * A janela de atendimento de 24 horas da Meta.
 *
 * ## O que é
 *
 * Na API oficial do WhatsApp, a empresa só pode escrever texto livre
 * para alguém dentro de **24 horas** contadas da última mensagem que
 * **essa pessoa** mandou. Fora disso, só passa *template* aprovado
 * previamente pela Meta. Não é limite nosso: é a regra da plataforma, e
 * quem a fura recebe 131047 e a mensagem não chega.
 *
 * ## Por que a conta é nossa também
 *
 * Dava para simplesmente mandar e deixar a Meta recusar. Não serve por
 * três motivos:
 *
 * 1. A fila tentaria de novo quatro vezes, com backoff, e nenhuma das
 *    quatro passaria — porque o que falta não é rede, é permissão.
 * 2. O erro da Meta é um número, e "131047" no diagnóstico não conta a
 *    ninguém o que houve.
 * 3. Quem respondeu precisa **saber na hora** que a resposta não vai
 *    sair, para escolher outro caminho — e não descobrir pelo cliente
 *    que nunca recebeu.
 *
 * ## De onde sai a última entrada
 *
 * Do `max(receivedAt)` de `InboundMessage` para aquele telefone naquela
 * conta. O fato já está gravado; uma coluna à parte com a mesma verdade
 * seria um segundo lugar para ela ficar errada.
 */

export const JANELA_HORAS = 24;

/**
 * Uma folga antes do fim, porque o relógio não é o mesmo.
 *
 * A mensagem é enfileirada num instante e despachada em outro, e o
 * relógio da Meta não é o nosso. Mandar aos 23 h 59 min 58 s é apostar
 * que os dois relógios concordam ao segundo. Cinco minutos de folga
 * custam pouco e evitam o caso em que a resposta é aceita aqui e
 * recusada lá.
 */
export const FOLGA_MINUTOS = 5;

/** Dá para escrever texto livre para esta pessoa agora? */
export function dentroDaJanela(ultimaEntrada: Date | null | undefined, agora = new Date()): boolean {
  return restamMs(ultimaEntrada, agora) > 0;
}

/** Quanto tempo ainda resta da janela, em milissegundos. Zero se fechada. */
export function restamMs(ultimaEntrada: Date | null | undefined, agora = new Date()): number {
  if (!ultimaEntrada) return 0;

  const fim =
    ultimaEntrada.getTime() + JANELA_HORAS * 3600_000 - FOLGA_MINUTOS * 60_000;

  return Math.max(0, fim - agora.getTime());
}

/**
 * Por que a mensagem não saiu, em português, para a tela e para o log.
 *
 * Nunca "erro 131047": quem lê o diagnóstico precisa entender sem abrir
 * a documentação da Meta.
 */
export function motivoDaJanelaFechada(ultimaEntrada: Date | null | undefined): string {
  if (!ultimaEntrada) {
    return (
      'Esta pessoa nunca escreveu por este número. Pela regra do WhatsApp, ' +
      'a empresa não pode iniciar conversa com texto livre — só com um modelo ' +
      'aprovado pela Meta.'
    );
  }

  const horas = Math.floor((Date.now() - ultimaEntrada.getTime()) / 3600_000);

  return (
    `A janela de ${JANELA_HORAS} h do WhatsApp fechou: a última mensagem desta ` +
    `pessoa chegou há ${horas} h. Texto livre só volta a passar quando ela ` +
    'escrever de novo; antes disso, só um modelo aprovado pela Meta.'
  );
}

/** Quanto falta, em palavras, para o selo na tela do chamado. */
export function restanteEmPalavras(ultimaEntrada: Date | null | undefined): string | null {
  const restante = restamMs(ultimaEntrada);
  if (restante <= 0) return null;

  const horas = Math.floor(restante / 3600_000);
  if (horas >= 1) return `${horas} h`;

  return `${Math.max(1, Math.round(restante / 60_000))} min`;
}
