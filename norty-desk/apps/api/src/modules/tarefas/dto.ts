import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Teto de 24h por apontamento: mais que isso é engano de unidade. */
const MAX_APONTAMENTO = 24 * 3600;

export class CriarTarefaDto {
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assigneeId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() plannedStart?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() plannedEnd?: string | null;

  /** Tempo já gasto ao registrar. Em segundos, nunca em horas fracionadas. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_APONTAMENTO) spentSeconds?: number;
}

export class EditarTarefaDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20000) body?: string;
  @IsOptional() @IsBoolean() done?: boolean;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assigneeId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() plannedStart?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() plannedEnd?: string | null;

  /**
   * Somado ao que já estava apontado.
   *
   * Apontar tempo é **acrescentar**, não substituir: quem trabalhou mais
   * meia hora informa a meia hora, e não o total que teria de calcular
   * na cabeça — que é onde o número deixa de bater.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_APONTAMENTO)
  addSpentSeconds?: number;
}
