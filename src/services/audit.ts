/* Trilha de auditoria: toda ação crítica da demonstração é registrada. */

import { insert, nextId, where } from '../data/repositories';
import type { AuditEntry, ID, UserRole } from '../data/types';

export interface RecordAuditInput {
  condominiumId: ID;
  actorName: string;
  actorRole: UserRole;
  action: string;
  target: string;
  detail?: string;
  module: string;
}

export function recordAudit(input: RecordAuditInput): AuditEntry {
  const entry: AuditEntry = {
    id: nextId('aud'),
    at: new Date().toISOString(),
    ip: '187.22.104.61',
    ...input,
  };
  return insert('audit', entry);
}

export function auditTrail(condominiumId: ID): AuditEntry[] {
  return where('audit', (a) => a.condominiumId === condominiumId);
}
