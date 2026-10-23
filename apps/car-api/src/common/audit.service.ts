import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma';
import { actorType, type RequestContext } from './context';
import type { Tx } from './prisma.service';

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  /** Força o escopo de plataforma (organizationId nulo). */
  platformScope?: boolean;
  organizationId?: string | null;
}

/** Campos que nunca entram na trilha, mesmo que estejam no objeto. */
const REDACT = /^(passwordHash|password|refreshHash|tokenHash|mfaSecretEnc|secretEnc|secret|keyHash|apiKey|token)$/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 6) return '[profundo]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    // Decimal do Prisma vira texto exato.
    if ('toFixed' in (value as object) && typeof (value as { toFixed: unknown }).toFixed === 'function') {
      return String(value);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.test(k) ? '[omitido]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Trilha de auditoria. Grava na mesma transação da operação: se a
 * operação falhar, não sobra registro de algo que não aconteceu; se a
 * auditoria falhar, a operação sensível também não acontece.
 */
@Injectable()
export class AuditService {
  async record(tx: Tx, ctx: RequestContext | null, input: AuditInput): Promise<void> {
    await tx.auditLog.create({
      data: {
        organizationId: input.platformScope ? null : (input.organizationId ?? ctx?.organizationId ?? null),
        branchId: input.branchId ?? null,
        actorType: ctx ? actorType(ctx) : 'SYSTEM',
        actorUserId: ctx?.userId ?? null,
        actorName: ctx?.userName ?? 'Sistema',
        supportGrantId: ctx?.supportGrantId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: (sanitize(input.before) ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (sanitize(input.after) ?? undefined) as Prisma.InputJsonValue | undefined,
        reason: input.reason ?? null,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent?.slice(0, 300) ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });
  }

  /** Diferença rasa entre dois objetos: só os campos que mudaram. */
  static diff(before: Record<string, unknown>, after: Record<string, unknown>): { before: Record<string, unknown>; after: Record<string, unknown> } {
    const b: Record<string, unknown> = {};
    const a: Record<string, unknown> = {};
    for (const key of Object.keys(after)) {
      if (after[key] === undefined) continue;
      const left = sanitize(before[key]);
      const right = sanitize(after[key]);
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        b[key] = left;
        a[key] = right;
      }
    }
    return { before: b, after: a };
  }
}
