/**
 * Limpeza do corpo de e-mail.
 *
 * Equivale a `MailCollector::cleanContent()` do GLPI, e existe pelo
 * mesmo motivo: sem ela, cada resposta do cliente traz a conversa
 * inteira de volta, e a terceira mensagem do chamado tem oito telas de
 * citação.
 *
 * **O original nunca se perde**: `InboundMessage.bodyHtml` e
 * `rawHeaders` guardam a mensagem íntegra, e a tela do evento tem "ver
 * original" (`docs/06-canais.md`, seção 2.3).
 */

/** Marcadores que abrem a citação da mensagem anterior. */
const INICIO_DE_CITACAO: RegExp[] = [
  // Português, inglês e espanhol — os três que aparecem numa caixa
  // brasileira com cliente estrangeiro.
  /^\s*Em\s+.{4,80}\s+escreveu\s*:\s*$/im,
  /^\s*On\s+.{4,80}\s+wrote\s*:\s*$/im,
  /^\s*El\s+.{4,80}\s+escribió\s*:\s*$/im,
  /^\s*-{2,}\s*(Mensagem original|Original Message|Forwarded message)\s*-{2,}\s*$/im,
  /^\s*_{5,}\s*$/m,
  // Cabeçalho de citação do Outlook.
  /^\s*(De|From)\s*:\s*.+$\n^\s*(Enviada?|Sent)\s*:/im,
];

/** Rodapés de disclaimer corporativo. */
const RODAPES: RegExp[] = [
  /^\s*(Esta|This)\s+(mensagem|message|e-?mail).{0,120}(confidencial|confidential)/im,
  /^\s*AVISO\s+(LEGAL|DE\s+CONFIDENCIALIDADE)/im,
];

/**
 * Corta a citação e a assinatura de uma resposta de e-mail.
 *
 * A regra da assinatura é a do RFC 3676: uma linha com exatamente
 * `-- ` abre o bloco. Cortamos só quando ela aparece na segunda metade
 * do texto — em mensagem curta, `--` costuma ser travessão, não
 * assinatura.
 */
export function limparCorpoDeEmail(texto: string): string {
  if (!texto) return '';

  let corpo = texto.replace(/\r\n/g, '\n');

  // 1. Corta na primeira marca de citação.
  let corteMaisAlto = corpo.length;
  for (const padrao of INICIO_DE_CITACAO) {
    const achado = padrao.exec(corpo);
    if (achado && achado.index < corteMaisAlto) corteMaisAlto = achado.index;
  }
  corpo = corpo.slice(0, corteMaisAlto);

  // 2. Corta o rodapé corporativo.
  for (const padrao of RODAPES) {
    const achado = padrao.exec(corpo);
    if (achado) corpo = corpo.slice(0, achado.index);
  }

  // 3. Corta a assinatura, se ela estiver na segunda metade.
  const assinatura = /^-- $/m.exec(corpo);
  if (assinatura && assinatura.index > corpo.length / 2) {
    corpo = corpo.slice(0, assinatura.index);
  }

  // 4. Remove as linhas que sobraram começando com ">".
  corpo = corpo
    .split('\n')
    .filter((linha) => !/^\s*>/.test(linha))
    .join('\n');

  // 5. Comprime as linhas em branco em excesso e apara as pontas.
  return corpo.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Tira `Re:`, `Fwd:` e o marcador `[#123]` do assunto.
 *
 * Equivale a `MailCollector::cleanSubject()`. Sem isso, um chamado
 * aberto por resposta nasce chamado "Re: Re: Enc: alguma coisa".
 */
export function limparAssunto(assunto: string): string {
  return assunto
    .replace(/\[[^\]]*#\d+\]/g, '')
    .replace(/^(\s*(re|res|res\.|fw|fwd|enc|encaminhada)\s*:\s*)+/i, '')
    .trim();
}

/**
 * Converte HTML em texto legível.
 *
 * O corpo entra na conversa como texto: renderizar HTML de terceiro na
 * tela do agente é abrir a porta que o `Content-Disposition: attachment`
 * dos anexos fecha. O HTML original fica em `InboundMessage.bodyHtml`
 * para quem quiser ver.
 */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, codigo: string) => String.fromCodePoint(Number(codigo)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * O texto que vira o evento.
 *
 * Prefere o texto puro; cai no HTML convertido quando o remetente só
 * mandou HTML — o que é a maioria dos clientes de e-mail hoje.
 */
export function corpoDaMensagem(texto?: string | null, html?: string | null): string {
  const puro = (texto ?? '').trim();
  if (puro) return limparCorpoDeEmail(puro);
  if (html) return limparCorpoDeEmail(htmlParaTexto(html));
  return '';
}
