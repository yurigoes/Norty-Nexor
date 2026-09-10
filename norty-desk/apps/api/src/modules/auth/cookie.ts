import type { CookieOptions, Response } from 'express';

import { prefixoPublico } from '../../common/prefixo-publico';

/**
 * O refresh token mora num cookie `httpOnly`.
 *
 * `httpOnly` tira o token do alcance do JavaScript — um XSS no
 * aplicativo não consegue lê-lo. `sameSite: lax` basta porque
 * aplicativo e API vivem no mesmo domínio (`chamados.norty.com.br/api`,
 * ver `docs/11-infra.md`, seção 4); não há requisição de origem
 * cruzada a acomodar.
 *
 * O `path` é o da rota de renovação: o cookie não viaja em toda
 * chamada de API, só onde é usado. E é o caminho **de fora**
 * (`/api/v1/auth` atrás do nginx): com o de dentro (`/v1/auth`) o
 * navegador nunca devolvia o cookie ao `/api/v1/auth/refresh`, e todo
 * recarregamento de página jogava a pessoa no login.
 */
export const COOKIE_REFRESH = 'nd_refresh';

function opcoes(resposta: Response, expiraEm?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `${prefixoPublico(resposta.req)}/auth`,
    expires: expiraEm,
  };
}

export function gravarRefresh(resposta: Response, valor: string, expiraEm: Date): void {
  resposta.cookie(COOKIE_REFRESH, valor, opcoes(resposta, expiraEm));
}

export function limparRefresh(resposta: Response): void {
  resposta.clearCookie(COOKIE_REFRESH, opcoes(resposta));
}
