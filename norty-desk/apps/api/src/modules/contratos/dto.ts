import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
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
import {
  BILLING_PERIODS,
  CONTRACT_KINDS,
  COST_KINDS,
  type BillingPeriod,
  type ContractKind,
  type CostKind,
} from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const textoVirandoBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Dinheiro chega como número com duas casas. Nunca como string formatada. */
const DINHEIRO = { maxDecimalPlaces: 2 } as const;

export class EscreverFornecedorDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsEmail() email?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(40) phone?: string | null;
}

export class EscreverContratoDto {
  @IsString() @MinLength(1) @MaxLength(80) number!: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;

  @IsOptional() @IsIn(CONTRACT_KINDS) kind?: ContractKind;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() supplierId?: string | null;

  @IsDateString() startsAt!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() endsAt?: string | null;

  /** Teto de um ano: aviso maior que a vigência típica não avisa, atrapalha. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) noticeDays?: number;
  @IsOptional() @IsBoolean() autoRenew?: boolean;

  @IsOptional() @IsIn(BILLING_PERIODS) billingPeriod?: BillingPeriod;
  @IsOptional() @Type(() => Number) @IsNumber(DINHEIRO) @Min(0) value?: number;

  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EditarContratoDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) number?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;

  @IsOptional() @IsIn(CONTRACT_KINDS) kind?: ContractKind;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() supplierId?: string | null;

  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() endsAt?: string | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) noticeDays?: number;
  @IsOptional() @IsBoolean() autoRenew?: boolean;

  @IsOptional() @IsIn(BILLING_PERIODS) billingPeriod?: BillingPeriod;
  @IsOptional() @Type(() => Number) @IsNumber(DINHEIRO) @Min(0) value?: number;

  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class BuscarContratosDto {
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsOptional() @IsIn(CONTRACT_KINDS) kind?: ContractKind;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @Transform(textoVirandoBooleano) @IsBoolean() incluirInativos?: boolean;
  /** Só os que vencem em até N dias. É a pergunta que a tela faz. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) vencendoEm?: number;
}

export class VincularAtivoAoContratoDto {
  @IsUUID() assetId!: string;
}

export class EscreverOrcamentoDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @Type(() => Number) @IsNumber(DINHEIRO) @Min(0) value?: number;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class LancarCustoDto {
  @IsIn(COST_KINDS) kind!: CostKind;
  @IsString() @MinLength(1) @MaxLength(160) label!: string;

  /** Só para TEMPO. O valor da linha sai de `hours * hourlyRate`. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10000) hours?: number;
  @IsOptional() @Type(() => Number) @IsNumber(DINHEIRO) @Min(0) hourlyRate?: number;

  /** Para MATERIAL e FIXO. */
  @IsOptional() @Type(() => Number) @IsNumber(DINHEIRO) @Min(0) amount?: number;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() budgetId?: string | null;
}

export class RelatorioDeCustoDto {
  @IsOptional() @IsDateString() de?: string;
  @IsOptional() @IsDateString() ate?: string;
}
