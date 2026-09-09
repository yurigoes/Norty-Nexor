import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Confere a assinatura HMAC-SHA256 de um webhook de entrada.
 *
 * Comparação em tempo constante: comparar strings com `===` vaza o
 * tamanho do prefixo correto e, com paciência, a assinatura inteira.
 */
export function assinaturaConfere(corpoCru: Buffer | string, assinatura: string, segredo: string): boolean {
  const esperada = createHmac('sha256', segredo).update(corpoCru).digest('hex');
  const recebida = assinatura.replace(/^sha256=/, '');

  const a = Buffer.from(esperada, 'utf8');
  const b = Buffer.from(recebida, 'utf8');

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Assina um webhook de saída. Vai no cabeçalho `X-Desk-Signature`. */
export function assinar(corpo: string, segredo: string): string {
  return `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;
}
