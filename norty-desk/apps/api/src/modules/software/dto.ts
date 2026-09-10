import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LICENSE_KINDS } from '@norty-desk/shared';

/** Campo de texto opcional que aceita `null` (ou vazio) para limpar. */
const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class BuscarSoftwareDto {
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  /** Por padrão a lista esconde o software desativado. */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() incluirInativos?: boolean;
}

export class EscreverSoftwareDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() manufacturerId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(60) category?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EditarSoftwareDto extends EscreverSoftwareDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) declare name: string;
}

export class CriarVersaoDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
}

export class InstalarSoftwareDto {
  @IsUUID() softwareId!: string;
  /** Nome da versão; é criada se ainda não existir. */
  @IsString() @MinLength(1) @MaxLength(60) version!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() installedAt?: string | null;
}

export class EscreverLicencaDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsIn(LICENSE_KINDS) kind?: (typeof LICENSE_KINDS)[number];
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() versionId?: string | null;
  /** Ausente mantém a guardada; `null` ou vazio apaga. */
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(500) licenseKey?: string | null;
  /** Nulo = ilimitada. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) seats?: number | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() purchasedAt?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() expiresAt?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) purchaseValue?: number | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() supplierId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() contractId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EditarLicencaDto extends EscreverLicencaDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) declare name: string;
}

/** Exatamente um dos dois — o serviço confere, e o CHECK do banco também. */
export class AtribuirLicencaDto {
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsUUID() userId?: string;
}

export class LicencasVencendoDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) dias?: number;
}
