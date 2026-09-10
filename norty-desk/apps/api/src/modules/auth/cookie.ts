import type { CookieOptions, Response } from 'express';

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
 * chamada de API, só onde é usado.
 */
export const COOKIE_REFRESH = 'nd_refresh';

const PREFIXO = process.env.API_PREFIX ?? 'v1';

function opcoes(expiraEm?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/${PREFIXO}/auth`,
    expires: expiraEm,
  };
}

export function gravarRefresh(resposta: Response, valor: string, expiraEm: Date): void {
  resposta.cookie(COOKIE_REFRESH, valor, opcoes(expiraEm));
}

export function limparRefresh(resposta: Response): void {
  resposta.clearCookie(COOKIE_REFRESH, opcoes());
}
