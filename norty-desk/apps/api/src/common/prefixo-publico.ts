import type { IncomingHttpHeaders } from 'node:http';

const PREFIXO = process.env.API_PREFIX ?? 'v1';

/** Só segmentos de caminho simples: o valor vai para URL e para o `path` do cookie. */
const CAMINHO_SEGURO = /^(\/[A-Za-z0-9._-]+)*$/;

/**
 * O caminho da API como o **navegador** a enxerga.
 *
 * A API responde em `/v1`, mas em produção só é alcançável pelo nginx do
 * front, em `/api/v1` — o nginx corta o `/api` antes de repassar e avisa
 * com `X-Forwarded-Prefix`. Tudo o que a API devolve para o navegador usar
 * (URL da logo, `path` do cookie de sessão) precisa do caminho de fora.
 * Com o de dentro, a logo caía no fallback da SPA e vinha HTML (imagem
 * quebrada), e o cookie de renovação nunca era enviado.
 *
 * Sem o cabeçalho (acesso direto, testes), é `/v1`. Valor estranho no
 * cabeçalho é ignorado em vez de ir parar num cabeçalho `Set-Cookie`.
 */
export function prefixoPublico(requisicao?: { headers: IncomingHttpHeaders }): string {
  const bruto = requisicao?.headers['x-forwarded-prefix'];
  const antes = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim().replace(/\/+$/, '') ?? '';
  return `${CAMINHO_SEGURO.test(antes) ? antes : ''}/${PREFIXO}`;
}

/** Troca o prefixo de dentro (`/v1/...`) pelo de fora num caminho que a API gerou. */
export function paraCaminhoPublico(
  caminho: string | null,
  requisicao?: { headers: IncomingHttpHeaders },
): string | null {
  if (!caminho?.startsWith(`/${PREFIXO}/`)) return caminho;
  return prefixoPublico(requisicao) + caminho.slice(PREFIXO.length + 1);
}
