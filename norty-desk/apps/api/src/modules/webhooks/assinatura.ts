import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A assinatura da entrega.
 *
 * `sha256=<hex>` sobre `<timestamp>.<corpo>` — o mesmo formato do
 * Stripe e do GitHub, e por um motivo: quem recebe já tem biblioteca
 * pronta para conferir.
 *
 * O timestamp entra **dentro** do que se assina. Assinar só o corpo
 * deixa a entrega válida para sempre: quem interceptar uma vez pode
 * reenviá-la amanhã, e a assinatura ainda confere.
 */
export function assinar(corpo: string, segredo: string, agora = new Date()): {
  timestamp: string;
  assinatura: string;
} {
  const timestamp = String(Math.floor(agora.getTime() / 1000));
  const mac = createHmac('sha256', segredo).update(`${timestamp}.${corpo}`).digest('hex');

  return { timestamp, assinatura: `sha256=${mac}` };
}

/**
 * Confere uma assinatura. Existe para o teste e para quem integra
 * copiar — a API não recebe webhook assinado por ela mesma.
 *
 * `timingSafeEqual` e não `===`: comparar hash caractere a caractere
 * vaza, pelo tempo da comparação, quantos caracteres já batiam.
 */
export function conferir(
  corpo: string,
  segredo: string,
  timestamp: string,
  assinatura: string,
  toleranciaSegundos = 300,
): boolean {
  const idade = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(idade) || idade > toleranciaSegundos) return false;

  const esperado = createHmac('sha256', segredo).update(`${timestamp}.${corpo}`).digest();
  const recebido = Buffer.from(assinatura.replace(/^sha256=/, ''), 'hex');

  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(esperado, recebido);
}
