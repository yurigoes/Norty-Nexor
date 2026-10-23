import { promises as dns } from 'node:dns';
import { loadConfig } from '../../config/env';
import type { Tx } from '../../common/prisma.service';

/**
 * Verificação de domínio por DNS. Sem decorators: roda tanto no service
 * (verificação sob demanda) quanto na rotina agendada (reverificação).
 *
 * Duas provas, nesta ordem:
 *  1. propriedade — o TXT `_nortycar-verify.<host>` contém o token que só
 *     a empresa dona viu na tela; sem isso, ninguém associa o domínio dos
 *     outros à própria conta;
 *  2. apontamento — o host aponta (CNAME ou mesmo IP) para o destino Norty;
 *     sem isso o certificado não pode ser emitido.
 */
export interface DnsCheck {
  ownership: boolean;
  pointing: boolean;
  error: string | null;
}

export const VERIFY_PREFIX = '_nortycar-verify';

export async function checkDns(hostname: string, token: string): Promise<DnsCheck> {
  const target = loadConfig().siteCnameTarget.toLowerCase();
  let ownership = false;
  try {
    const records = await dns.resolveTxt(`${VERIFY_PREFIX}.${hostname}`);
    ownership = records.some((chunks) => chunks.join('').trim() === token);
  } catch {
    ownership = false;
  }
  if (!ownership) {
    return { ownership, pointing: false, error: `Registro TXT ${VERIFY_PREFIX}.${hostname} não encontrado ou com valor diferente do token.` };
  }
  let pointing = false;
  try {
    const cnames = await dns.resolveCname(hostname);
    pointing = cnames.some((c) => c.toLowerCase().replace(/\.$/, '') === target);
  } catch {
    // Domínio raiz não aceita CNAME: compara os IPs com os do destino.
    try {
      const [mine, theirs] = await Promise.all([dns.resolve4(hostname), dns.resolve4(target)]);
      pointing = mine.length > 0 && mine.every((ip) => theirs.includes(ip));
    } catch {
      pointing = false;
    }
  }
  return {
    ownership,
    pointing,
    error: pointing ? null : `O domínio ainda não aponta para ${target} (CNAME ou mesmo endereço IP).`,
  };
}

/** Aplica o resultado da verificação ao registro do domínio. */
export async function applyCheck(tx: Tx, domain: { id: string; hostname: string; status: string; verificationToken: string; verifiedAt: Date | null }) {
  const result = await checkDns(domain.hostname, domain.verificationToken);
  let status = domain.status;
  if (result.ownership && result.pointing) status = 'ACTIVE';
  else if (result.ownership) status = 'VERIFIED';
  // Domínio que já funcionou e parou de resolver é problema a avisar; o que
  // nunca foi verificado continua apenas pendente.
  else status = domain.verifiedAt ? 'MISCONFIGURED' : 'PENDING_VERIFICATION';
  if (domain.verifiedAt && result.ownership && !result.pointing) status = 'MISCONFIGURED';
  return tx.domain.update({
    where: { id: domain.id },
    data: {
      status: status as never,
      lastCheckedAt: new Date(),
      lastCheckError: result.error,
      verifiedAt: result.ownership ? (domain.verifiedAt ?? new Date()) : domain.verifiedAt,
    },
  });
}

/**
 * Reverifica os domínios próprios ativos ou com problema. Chamada pela
 * rotina agendada numa transação de plataforma.
 */
export async function checkDomains(tx: Tx): Promise<{ checked: number; misconfigured: number }> {
  const domains = await tx.domain.findMany({
    where: { kind: 'CUSTOM', status: { in: ['ACTIVE', 'VERIFIED', 'MISCONFIGURED'] } },
    take: 500,
  });
  let misconfigured = 0;
  for (const d of domains) {
    const updated = await applyCheck(tx, d);
    if (updated.status === 'MISCONFIGURED') misconfigured += 1;
  }
  return { checked: domains.length, misconfigured };
}
