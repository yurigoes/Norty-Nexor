import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CONSUMABLE_KINDS, MOVEMENT_KINDS } from '@norty-desk/shared';

/** Campo de texto opcional que aceita `null` (ou vazio) para limpar. */
const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;
const booleano = ({ value }: { value: unknown }) => value === true || value === 'true';

export class BuscarConsumiveisDto {
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsOptional() @IsIn(CONSUMABLE_KINDS) kind?: (typeof CONSUMABLE_KINDS)[number];
  @IsOptional() @Transform(booleano) @IsBoolean() abaixoDoMinimo?: boolean;
  @IsOptional() @Transform(booleano) @IsBoolean() incluirInativos?: boolean;
}

export class EscreverConsumivelDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsIn(CONSUMABLE_KINDS) kind?: (typeof CONSUMABLE_KINDS)[number];
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(80) reference?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() manufacturerId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() locationId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) minStock?: number;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20) unit?: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Modelos de equipamento compatíveis — é assim que a impressora sabe qual toner usa. */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) compatibleModelIds?: string[];
}

export class EditarConsumivelDto extends EscreverConsumivelDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) declare name: string;
}

export class MovimentarDto {
  @IsIn(MOVEMENT_KINDS) kind!: (typeof MOVEMENT_KINDS)[number];
  /** Positivo em entrada e saída; com sinal no ajuste. O serviço confere. */
  @Type(() => Number) @IsInt() @Min(-1_000_000) @Max(1_000_000) quantity!: number;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(500) note?: string | null;
}
