import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Prisma } from '../generated/prisma';

/**
 * Na fronteira da API o Decimal vira `number` uma única vez. As contas
 * de dinheiro acontecem antes, em centavos, nos services.
 */
export function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (Buffer.isBuffer(value)) return undefined;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}

@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => (data instanceof StreamableFile || Buffer.isBuffer(data) ? data : toJsonSafe(data))));
  }
}

/** Decimal → number para uso dentro dos services. */
export const num = (value: Prisma.Decimal | number | string | null | undefined): number =>
  value === null || value === undefined ? 0 : typeof value === 'number' ? value : Number(value.toString());
export const numOrNull = (value: Prisma.Decimal | number | string | null | undefined): number | null =>
  value === null || value === undefined ? null : num(value);
