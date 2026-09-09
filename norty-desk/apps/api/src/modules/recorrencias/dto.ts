import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TICKET_TYPES, TIPOS_DE_RECORRENCIA, type TicketType } from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/**
 * O descritor de recorrência como DTO.
 *
 * A união discriminada de `packages/shared` não vira classe: um DTO por
 * variante multiplicaria o mesmo formulário por quatro. Aqui a classe é
 * uma só, com os campos de todas as variantes opcionais, e o serviço
 * valida a combinação — que é onde a regra realmente mora
 * (`recorrenciaValida`).
 */
export class RecorrenciaDto {
  @IsIn(TIPOS_DE_RECORRENCIA) tipo!: (typeof TIPOS_DE_RECORRENCIA)[number];

  @Type(() => Number) @IsInt() @Min(0) @Max(23) hora!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(59) minuto!: number;

  /** Só para SEMANAL. 0 = domingo .. 6 = sábado. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  diasDaSemana?: number[];

  /** Só para MENSAL e ANUAL. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31) diaDoMes?: number;

  /** Só para ANUAL. 1 = janeiro. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) mes?: number;
}

export class EscreverRecorrenciaDto {
  @IsString() @MinLength(3) @MaxLength(160) name!: string;

  @IsString() @MinLength(3) @MaxLength(255) subject!: string;
  @IsString() @MinLength(3) @MaxLength(20000) description!: string;

  @IsObject() @ValidateNested() @Type(() => RecorrenciaDto) schedule!: RecorrenciaDto;

  @IsOptional() @IsIn(TICKET_TYPES) ticketType?: TicketType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) urgency?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) impact?: number;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedTeamId?: string | null;
  /** Omitido, o requerente é quem criou a agenda. */
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() requesterId?: string | null;

  @IsOptional() @IsString() @MaxLength(64) timezone?: string;

  /**
   * Teto de 90 dias: antecedência maior que isso quase sempre é engano
   * de unidade — alguém digitou segundos onde queria dizer dias.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90 * 24 * 3600)
  createBeforeSeconds?: number;

  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() startsAt?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() endsAt?: string | null;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Editar não repete os obrigatórios. */
export class EditarRecorrenciaDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(255) subject?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(20000) description?: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => RecorrenciaDto) schedule?: RecorrenciaDto;

  @IsOptional() @IsIn(TICKET_TYPES) ticketType?: TicketType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) urgency?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) impact?: number;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedTeamId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() requesterId?: string | null;

  @IsOptional() @IsString() @MaxLength(64) timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90 * 24 * 3600)
  createBeforeSeconds?: number;

  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() startsAt?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() endsAt?: string | null;

  @IsOptional() @IsBoolean() isActive?: boolean;
}
