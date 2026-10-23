/**
 * Rotinas de locação chamadas pela rotina agendada (módulo de
 * notificações/automação) e pelos endpoints manuais. São funções puras de
 * Prisma — sem injeção de dependência — para rodar dentro de qualquer
 * transação de empresa, inclusive a do agendador que percorre todas elas.
 *
 * Ambas são idempotentes: rodar duas vezes não duplica nada.
 */
import { centsToDecimalString, isoDateInZone, monthlyInstallments, toCents } from '@nortycar/shared';
import type { Tx } from '../../common/prisma.service';
import { orgSettings } from '../../common/org-settings';
import { num } from '../../common/serialize.interceptor';

/**
 * Gera as mensalidades dos contratos de longo prazo em vigor que vencem
 * dentro do horizonte. A unicidade (contrato, tipo, competência) no banco
 * é quem garante que nenhuma competência nasce duas vezes, mesmo com duas
 * execuções simultâneas.
 */
export async function generateDueInstallments(tx: Tx, organizationId: string, horizonDays = 35, contractId?: string): Promise<number> {
  const horizon = new Date(`${isoDateInZone(new Date(Date.now() + horizonDays * 86_400_000))}T00:00:00.000Z`);
  const contracts = await tx.rentalContract.findMany({
    where: { organizationId, kind: 'LONG_TERM', status: 'ACTIVE', ...(contractId ? { id: contractId } : {}) },
    include: { vehicles: { where: { endAt: null }, select: { vehicleUnitId: true } } },
  });
  let created = 0;
  for (const c of contracts) {
    if (!c.monthlyAmount || !c.termMonths) continue;
    const start = c.actualStartAt ?? c.startAt;
    const schedule = monthlyInstallments(start, c.termMonths, c.billingDay ?? Math.min(28, start.getUTCDate()), Number(c.monthlyAmount));
    const due = schedule.filter((i) => new Date(`${i.dueDate}T00:00:00.000Z`) <= horizon);
    if (!due.length) continue;
    const result = await tx.receivable.createMany({
      data: due.map((i) => ({
        organizationId,
        branchId: c.branchId,
        customerId: c.customerId,
        contractId: c.id,
        vehicleUnitId: c.vehicles[0]?.vehicleUnitId ?? null,
        kind: 'MONTHLY' as const,
        description: `Mensalidade ${String(i.number).padStart(2, '0')}/${String(c.termMonths).padStart(2, '0')} — contrato ${c.number} (competência ${i.competence.slice(5)}/${i.competence.slice(0, 4)})`,
        // O valor vigente no momento da geração: reajuste e aditivo valem
        // para as competências futuras, nunca reescrevem as já emitidas.
        amount: centsToDecimalString(toCents(num(c.monthlyAmount))),
        dueDate: new Date(`${i.dueDate}T00:00:00.000Z`),
        competence: i.competence,
        installment: i.number,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
}

/**
 * Expira pedidos de reserva (site, portal ou balcão) não confirmados no
 * prazo da empresa, ou cuja retirada já passou. Pedido não ocupa agenda,
 * então expirar não libera alocação — só tira o pedido da fila.
 */
export async function expireRequested(tx: Tx, organizationId: string): Promise<number> {
  const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const hours = orgSettings(org?.settings).requestExpiryHours;
  const limit = new Date(Date.now() - hours * 3_600_000);
  const { count } = await tx.reservation.updateMany({
    where: { organizationId, status: 'REQUESTED', OR: [{ createdAt: { lt: limit } }, { startAt: { lt: new Date() } }] },
    data: { status: 'EXPIRED', cancelReason: `Expirada sem confirmação (prazo de ${hours} h).` },
  });
  return count;
}

