import { isIP } from 'node:net';

/**
 * Endereços e sub-redes.
 *
 * O Postgres (`inet`) é quem guarda, valida e compara — contenção com
 * `<<=` vale para IPv4 e IPv6. Aqui fica só o que o banco não responde
 * bem sozinho: normalizar a entrada, contar hosts e achar o próximo IPv4
 * livre de uma sub-rede.
 */

export type Cidr = { familia: 4 | 6; rede: string; mascara: number };

const MAX_BUSCA_LIVRE = 65_536;

export function ipv4ParaNumero(ip: string): number {
  return ip.split('.').reduce((acc, parte) => acc * 256 + Number(parte), 0);
}

export function numeroParaIpv4(n: number): string {
  return [24, 16, 8, 0].map((d) => Math.floor(n / 2 ** d) % 256).join('.');
}

/** Endereço de host válido, sem máscara. Devolve normalizado ou nulo. */
export function normalizarIp(entrada: string): string | null {
  const ip = entrada.trim();
  const familia = isIP(ip);
  if (familia === 0) return null;
  return familia === 4 ? numeroParaIpv4(ipv4ParaNumero(ip)) : ip.toLowerCase();
}

/**
 * "192.168.15.0/24". Aceita o endereço de rede com bits de host ligados
 * ("192.168.15.7/24") e devolve a rede certa — é o engano mais comum de
 * quem digita. Em IPv6 só valida; a rede certa o banco confere.
 */
export function normalizarCidr(entrada: string): Cidr | null {
  const [ip, mascaraTexto, sobra] = entrada.trim().split('/');
  if (!ip || mascaraTexto === undefined || sobra !== undefined || !/^\d{1,3}$/.test(mascaraTexto)) return null;
  const familia = isIP(ip);
  const mascara = Number(mascaraTexto);
  if (familia === 4) {
    if (mascara > 32) return null;
    const bloco = 2 ** (32 - mascara);
    const rede = Math.floor(ipv4ParaNumero(ip) / bloco) * bloco;
    return { familia: 4, rede: numeroParaIpv4(rede), mascara };
  }
  if (familia === 6) {
    if (mascara > 128) return null;
    return { familia: 6, rede: ip.toLowerCase(), mascara };
  }
  return null;
}

export const cidrTexto = (c: Cidr) => `${c.rede}/${c.mascara}`;

/** Hosts utilizáveis. /31 tem 2 (ponto a ponto), /32 tem 1. Nulo em IPv6. */
export function hostsUtilizaveis(c: Cidr): number | null {
  if (c.familia !== 4) return null;
  const total = 2 ** (32 - c.mascara);
  return c.mascara >= 31 ? total : total - 2;
}

export function contem(c: Cidr, ip: string): boolean {
  if (c.familia !== 4 || isIP(ip) !== 4) return false;
  const bloco = 2 ** (32 - c.mascara);
  const inicio = ipv4ParaNumero(c.rede);
  const n = ipv4ParaNumero(ip);
  return n >= inicio && n < inicio + bloco;
}

/** Primeiro IPv4 livre da sub-rede, pulando rede, broadcast e o que já está usado. */
export function proximoLivre(c: Cidr, usados: Iterable<string>): string | null {
  if (c.familia !== 4) return null;
  const ocupados = new Set([...usados].map((ip) => (isIP(ip) === 4 ? ipv4ParaNumero(ip) : -1)));
  const bloco = 2 ** (32 - c.mascara);
  const inicio = ipv4ParaNumero(c.rede);
  const [primeiro, ultimo] = c.mascara >= 31 ? [inicio, inicio + bloco - 1] : [inicio + 1, inicio + bloco - 2];
  for (let n = primeiro, passos = 0; n <= ultimo && passos < MAX_BUSCA_LIVRE; n++, passos++) {
    if (!ocupados.has(n)) return numeroParaIpv4(n);
  }
  return null;
}

/** MAC em minúsculas com dois-pontos. Aceita "-", ".", ":" ou nada entre os bytes. */
export function normalizarMac(entrada: string): string | null {
  const hex = entrada.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12 || /[^0-9a-f:.\-\s]/i.test(entrada.trim())) return null;
  return hex.match(/../g)!.join(':');
}
