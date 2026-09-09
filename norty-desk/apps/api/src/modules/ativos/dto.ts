import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { ASSET_KINDS, ASSET_STATUSES } from '@norty-desk/shared';

/** Campo de texto opcional que aceita `null` para limpar. */
const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class EscreverAtivoDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;

  @IsOptional() @IsIn(ASSET_KINDS) kind?: (typeof ASSET_KINDS)[number];
  @IsOptional() @IsIn(ASSET_STATUSES) status?: (typeof ASSET_STATUSES)[number];

  // Etiqueta e série em branco viram `null`: string vazia colidiria no
  // índice único, e o CHECK do banco a recusaria com erro feio.
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(80) tag?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(120) serialNumber?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(120) manufacturer?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(120) model?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(160) location?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() userId?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() purchasedAt?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() warrantyUntil?: string | null;
}

export class EditarAtivoDto extends EscreverAtivoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) declare name: string;
}

export class BuscarAtivosDto {
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsOptional() @IsIn(ASSET_KINDS) kind?: (typeof ASSET_KINDS)[number];
  @IsOptional() @IsIn(ASSET_STATUSES) status?: (typeof ASSET_STATUSES)[number];
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class VincularAtivoDto {
  @IsUUID() assetId!: string;
}

export class ResponderPesquisaDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) score!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}
