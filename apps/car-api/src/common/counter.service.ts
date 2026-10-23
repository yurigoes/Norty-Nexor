import { Injectable } from '@nestjs/common';
import type { Tx } from './prisma.service';

/**
 * Numeração sequencial por empresa. O UPDATE ... RETURNING trava a
 * linha do contador até o fim da transação: duas reservas simultâneas
 * nunca recebem o mesmo código, e um número só é consumido se a
 * operação inteira for confirmada.
 */
@Injectable()
export class CounterService {
  async next(tx: Tx, organizationId: string, key: string, prefix: string, pad = 6): Promise<string> {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "org_counters" ("organizationId", "key", "value")
      VALUES (${organizationId}::uuid, ${key}, 1)
      ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = "org_counters"."value" + 1
      RETURNING "value"`;
    const value = rows[0]?.value ?? 1;
    return `${prefix}${String(value).padStart(pad, '0')}`;
  }
}
