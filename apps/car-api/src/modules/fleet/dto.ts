import { Transform } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min,
} from 'class-validator';
import { PageQueryDto, ToBool } from '../../common/pagination';

const FUELS = ['FLEX', 'GASOLINE', 'ETHANOL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'CNG'];
const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC', 'CVT', 'AUTOMATED'];
const COMMERCIAL = ['AVAILABLE', 'RESERVED', 'RENTED', 'FOR_SALE', 'SOLD'];
const OPERATIONAL = ['RELEASED', 'IN_INSPECTION', 'IN_MAINTENANCE', 'BLOCKED', 'AWAITING_RELEASE'];
const YEAR_MAX = new Date().getFullYear() + 2;

export class VehicleQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() modelId?: string;
  @IsOptional() @IsIn(COMMERCIAL) commercialStatus?: string;
  @IsOptional() @IsIn(OPERATIONAL) operationalStatus?: string;
  @IsOptional() @ToBool() @IsBoolean() includeSold?: boolean;
  @IsOptional() @ToBool() @IsBoolean() includeDeleted?: boolean;
}

export class CreateVehicleDto {
  @IsUUID() branchId!: string;
  @IsUUID() modelId!: string;
  @IsOptional() @IsUUID() versionId?: string;
  /** Padrão: a categoria do modelo. */
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @Length(2, 20) internalCode?: string;
  @IsString() @Length(7, 8) plate!: string;
  @IsOptional() @IsString() @Length(9, 11) renavam?: string;
  @IsOptional() @IsString() @Length(17, 17) chassis?: string;
  @IsOptional() @IsString() @MaxLength(30) engineNumber?: string;
  @IsInt() @Min(1950) @Max(YEAR_MAX) yearManufacture!: number;
  @IsInt() @Min(1950) @Max(YEAR_MAX + 1) yearModel!: number;
  @IsString() @Length(2, 40) color!: string;
  @IsIn(FUELS) fuel!: string;
  @IsIn(TRANSMISSIONS) transmission!: string;
  @IsOptional() @IsInt() @Min(1) @Max(6) doors?: number;
  @IsOptional() @IsInt() @Min(1) @Max(400) tankCapacityLiters?: number;
  @IsInt() @Min(0) @Max(2_000_000) odometerKm!: number;
  @IsOptional() @IsDateString() acquiredAt?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) acquisitionValue?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) marketValue?: number;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsDateString() licensingDueDate?: string;
  @IsOptional() @IsDateString() ipvaDueDate?: string;
  @IsOptional() @IsUUID() insurancePolicyId?: string;
  @IsOptional() @IsBoolean() publicVisible?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

/** Edição: placa, RENAVAM e chassi podem ser corrigidos (o id é a identidade). Filial muda por transferência. */
export class UpdateVehicleDto {
  @IsOptional() @IsUUID() modelId?: string;
  @IsOptional() @IsUUID() versionId?: string | null;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @Length(2, 20) internalCode?: string;
  @IsOptional() @IsString() @Length(7, 8) plate?: string;
  @IsOptional() @IsString() @Length(9, 11) renavam?: string | null;
  @IsOptional() @IsString() @Length(17, 17) chassis?: string | null;
  @IsOptional() @IsString() @MaxLength(30) engineNumber?: string | null;
  @IsOptional() @IsInt() @Min(1950) @Max(YEAR_MAX) yearManufacture?: number;
  @IsOptional() @IsInt() @Min(1950) @Max(YEAR_MAX + 1) yearModel?: number;
  @IsOptional() @IsString() @Length(2, 40) color?: string;
  @IsOptional() @IsIn(FUELS) fuel?: string;
  @IsOptional() @IsIn(TRANSMISSIONS) transmission?: string;
  @IsOptional() @IsInt() @Min(1) @Max(6) doors?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(400) tankCapacityLiters?: number | null;
  @IsOptional() @IsDateString() acquiredAt?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) acquisitionValue?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) marketValue?: number | null;
  @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) location?: string | null;
  @IsOptional() @IsDateString() licensingDueDate?: string | null;
  @IsOptional() @IsDateString() ipvaDueDate?: string | null;
  @IsOptional() @IsUUID() insurancePolicyId?: string | null;
  @IsOptional() @IsBoolean() publicVisible?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}

export class StatusChangeDto {
  @IsIn(['COMMERCIAL', 'OPERATIONAL']) field!: 'COMMERCIAL' | 'OPERATIONAL';
  @IsString() to!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class OdometerDto {
  @IsInt() @Min(0) @Max(2_000_000) km!: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class TransferDto {
  @IsUUID() branchId!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class BlockDto {
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsString() @Length(3, 300) reason!: string;
}

export class RangeQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
}

export class AvailabilityQueryDto {
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() modelId?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class DuplicateQueryDto {
  @IsOptional() @IsString() @MaxLength(10) plate?: string;
  @IsOptional() @IsString() @MaxLength(12) renavam?: string;
  @IsOptional() @IsString() @MaxLength(20) chassis?: string;
  @IsOptional() @IsString() @MaxLength(20) internalCode?: string;
  @IsOptional() @IsUUID() excludeId?: string;
}

export class TimelineQueryDto {
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(30) type?: string;
}
