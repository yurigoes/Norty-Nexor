import type { Request } from 'express';

/**
 * O endereço de quem fez a requisição, para a contagem de tentativas.
 *
 * `X-Forwarded-For` é escrito pelo cliente quando não há proxy à
 * frente — quem quisesse passar pelo bloqueio mandaria um cabeçalho
 * diferente a cada tentativa. Por isso este cabeçalho só é lido quando
 * `TRUST_PROXY=1`, que é o que a infraestrutura com Caddy na frente
 * liga (`docs/11-infra.md`). Sem ele, vale o endereço da conexão, que
 * ninguém falsifica.
 *
 * Do encadeamento, o **primeiro** endereço é o cliente original; os
 * seguintes são os proxies. Pegar o último barraria o proxy inteiro de
 * uma vez, e o primeiro é o que o Caddy escreve.
 */
export function ipDaRequisicao(requisicao: Request): string {
  if (process.env.TRUST_PROXY === '1') {
    const encaminhado = requisicao.headers['x-forwarded-for'];
    const primeiro = (Array.isArray(encaminhado) ? encaminhado[0] : encaminhado)
      ?.split(',')[0]
      ?.trim();
    if (primeiro) return primeiro;
  }

  return requisicao.socket.remoteAddress ?? requisicao.ip ?? 'desconhecido';
}
