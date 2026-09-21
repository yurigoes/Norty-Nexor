import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AgendarDto {
  /**
   * ISO 8601. Aceita com ou sem fuso; sem fuso o `Date` do Node lê como
   * UTC, então o aplicativo manda sempre com deslocamento.
   */
  @IsISO8601() scheduledFor!: string;

  @IsOptional() @Type(() => Number) @IsInt() durationMinutes?: number;

  @IsOptional() @IsUUID() technicianId?: string;

  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CancelarAgendamentoDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
