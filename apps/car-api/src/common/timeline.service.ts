import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma';
import type { TimelineEventType } from '@nortycar/shared';
import type { RequestContext } from './context';
import type { Tx } from './prisma.service';

export interface TimelineInput {
  vehicleUnitId: string;
  type: TimelineEventType;
  title: string;
  description?: string | null;
  refType?: string;
  refId?: string | null;
  data?: Record<string, unknown>;
  at?: Date;
}

/**
 * Linha do tempo por placa. Cada módulo que toca um veículo registra
 * aqui, na mesma transação. A tabela só aceita inserção.
 */
@Injectable()
export class TimelineService {
  async record(tx: Tx, ctx: RequestContext | null, organizationId: string, input: TimelineInput): Promise<void> {
    await tx.vehicleTimelineEvent.create({
      data: {
        organizationId,
        vehicleUnitId: input.vehicleUnitId,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
        actorUserId: ctx?.userId ?? null,
        actorName: ctx?.userName ?? 'Sistema',
        at: input.at ?? new Date(),
      },
    });
  }

  /**
   * Registra uma leitura de hodômetro e avança o odômetro do carro
   * (nunca o faz regredir: uma leitura menor fica registrada, mas não
   * apaga a maior).
   */
  async odometer(
    tx: Tx, ctx: RequestContext | null, organizationId: string,
    vehicleUnitId: string, km: number,
    source: 'REGISTRATION' | 'INSPECTION' | 'CONTRACT' | 'REFUEL' | 'WORK_ORDER' | 'MANUAL', refId?: string,
  ): Promise<void> {
    await tx.odometerReading.create({
      data: { organizationId, vehicleUnitId, km, source, refId: refId ?? null, userId: ctx?.userId ?? null },
    });
    await tx.vehicleUnit.updateMany({
      where: { id: vehicleUnitId, odometerKm: { lt: km } },
      data: { odometerKm: km },
    });
  }
}
