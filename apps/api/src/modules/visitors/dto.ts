import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches,
  Max, MaxLength, Min, MinLength,
} from 'class-validator';

const KINDS = ['unica', 'temporaria', 'recorrente', 'permanente'] as const;
const CATEGORIES = ['visita', 'prestador', 'entrega', 'convidado_evento'] as const;

export class CreateVisitorDto {
  @IsString() @MinLength(3) @MaxLength(120)
  name!: string;

  @IsString() @MaxLength(40)
  document!: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @IsDateString({}, { message: 'Informe a data prevista.' })
  expectedDate!: string;

  @Matches(/^\d{2}:\d{2}$/, { message: 'Horário deve estar no formato HH:MM.' })
  expectedTime!: string;

  @IsOptional() @IsDateString()
  validUntil?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(7)
  @Type(() => Number) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  recurrenceDays?: number[];

  @IsOptional() @IsString() @MaxLength(400)
  notes?: string;

  @IsOptional() @IsString() @MaxLength(10)
  vehiclePlate?: string;

  @IsOptional() @IsString() @MaxLength(120)
  companyName?: string;

  /** Só a gestão e a portaria informam a unidade; o morador usa a dele. */
  @IsOptional() @IsString()
  unitId?: string;
}

export class CheckInDto {
  @IsOptional() @IsString() @MaxLength(200)
  notes?: string;
}
