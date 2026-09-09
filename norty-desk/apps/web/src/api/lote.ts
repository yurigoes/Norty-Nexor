import type { AuditEntry, BulkAction, BulkResult } from '@norty-desk/shared';

import { chamar } from './cliente';

export const acaoEmLote = (ticketIds: string[], acao: BulkAction) =>
  chamar<BulkResult>('/tickets/lote', { metodo: 'POST', corpo: { ticketIds, acao } });

export const trilhaDeAuditoria = (filtro: {
  entity?: string;
  entityId?: string;
  actorId?: string;
  limit?: number;
} = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtro)) if (v) p.set(k, String(v));
  const q = p.toString();
  return chamar<AuditEntry[]>(`/audit-logs${q ? `?${q}` : ''}`);
};
