import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** Períodos que a tela oferece. Datas soltas ficam para o relatório. */
export const PERIODOS = ['7d', '30d', '90d', '12m'] as const;
export type Periodo = (typeof PERIODOS)[number];

export class PainelDto {
  @IsOptional() @IsIn(PERIODOS) periodo?: Periodo;
  @IsOptional() @IsUUID() teamId?: string;
}

export class RelatorioSlaDto {
  @IsOptional() @IsIn(PERIODOS) periodo?: Periodo;
  @IsOptional() @IsUUID() teamId?: string;

  @IsOptional()
  @IsIn(['categoria', 'time', 'prioridade', 'acordo'])
  agrupar?: 'categoria' | 'time' | 'prioridade' | 'acordo';

  @IsOptional()
  @IsIn(['json', 'csv'])
  formato?: 'json' | 'csv';
}

export class RelatorioVolumeDto {
  @IsOptional() @IsIn(PERIODOS) periodo?: Periodo;

  @IsOptional()
  @IsIn(['categoria', 'canal', 'time', 'dia'])
  agrupar?: 'categoria' | 'canal' | 'time' | 'dia';

  @IsOptional() @IsIn(['json', 'csv']) formato?: 'json' | 'csv';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @Transform(({ value }) => Number(value))
  limit?: number;
}

/** O início do período, em UTC. `12m` é doze meses, não 360 dias. */
export function inicioDoPeriodo(periodo: Periodo = '30d', agora = new Date()): Date {
  const inicio = new Date(agora);

  switch (periodo) {
    case '7d':
      inicio.setUTCDate(inicio.getUTCDate() - 7);
      break;
    case '30d':
      inicio.setUTCDate(inicio.getUTCDate() - 30);
      break;
    case '90d':
      inicio.setUTCDate(inicio.getUTCDate() - 90);
      break;
    case '12m':
      inicio.setUTCMonth(inicio.getUTCMonth() - 12);
      break;
  }

  return inicio;
}
