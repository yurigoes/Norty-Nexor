import { Transform, Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const KINDS = ['SLA', 'OLA'] as const;
const TARGETS = ['TTO', 'TTR'] as const;

export class EscreverAcordoDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(KINDS) kind!: (typeof KINDS)[number];
  @IsIn(TARGETS) target!: (typeof TARGETS)[number];

  /**
   * Prazo em **segundos de expediente**. A tela oferece horas; a API
   * recebe segundos porque é o que o cálculo usa, e converter num lugar
   * só evita duas verdades sobre o mesmo prazo.
   */
  @Type(() => Number) @IsInt() @Min(60) @Max(365 * 24 * 3600) durationSeconds!: number;

  @IsOptional() @IsUUID() calendarId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EditarAcordoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(60) @Max(365 * 24 * 3600) durationSeconds?: number;
  @IsOptional() @IsUUID() calendarId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EscreverNivelDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;

  /** Negativo avisa antes do vencimento; positivo, depois. */
  @Type(() => Number) @IsInt() @Min(-30 * 24 * 3600) @Max(30 * 24 * 3600) offsetSeconds!: number;

  @IsOptional() @Allow() criteria?: unknown;
  @Allow() actions!: unknown;
}

export class SegmentoDto {
  /** 0 = domingo … 6 = sábado. */
  @Type(() => Number) @IsInt() @Min(0) @Max(6) weekday!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(1440) startMinute!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(1440) endMinute!: number;
}

export class EscreverCalendarioDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  // Fuso inválido só apareceria semanas depois, num prazo calculado
  // errado. Aqui ele é recusado na hora.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  timezone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SegmentoDto)
  segments?: SegmentoDto[];
}

export class FeriadoDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsBoolean() isRecurring?: boolean;
}

export class EscreverMotivoDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90 * 24 * 3600)
  followupIntervalSeconds?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) followupsBeforeResolution?: number;
  @IsOptional() @IsString() @MaxLength(2000) followupTemplate?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

/**
 * Edição parcial.
 *
 * `PATCH` com o DTO de criação exigiria reenviar o nome para mudar só o
 * intervalo de cobrança — e uma tela que esquecesse de mandá-lo levaria
 * 400 sem explicar o motivo.
 */
export class EditarMotivoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90 * 24 * 3600)
  followupIntervalSeconds?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) followupsBeforeResolution?: number;
  @IsOptional() @IsString() @MaxLength(2000) followupTemplate?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class EditarCalendarioDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  timezone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SegmentoDto)
  segments?: SegmentoDto[];
}
