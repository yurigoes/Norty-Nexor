import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';

export class RateTableDto {
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() branchId?: string | null;
  @IsString() @Length(2, 80) name!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) dailyRate!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) weeklyRate?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monthlyRate?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10_000) includedKmPerDay?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) extraKmRate?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) additionalDriverDaily?: number;
  @IsOptional() @IsInt() @Min(0) @Max(720) lateGraceMinutes?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) depositAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) longTermMonthly?: number | null;
  @IsOptional() @IsInt() @Min(1) longTermKmPerMonth?: number | null;
  @IsOptional() @IsBoolean() publicVisible?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateRateTableDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) dailyRate?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) weeklyRate?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monthlyRate?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10_000) includedKmPerDay?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) extraKmRate?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) additionalDriverDaily?: number;
  @IsOptional() @IsInt() @Min(0) @Max(720) lateGraceMinutes?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) depositAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) longTermMonthly?: number | null;
  @IsOptional() @IsInt() @Min(1) longTermKmPerMonth?: number | null;
  @IsOptional() @IsBoolean() publicVisible?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ExtraServiceDto {
  @IsString() @Length(2, 80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsIn(['PER_DAY', 'FIXED']) pricing!: 'PER_DAY' | 'FIXED';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000) price!: number;
  @IsOptional() @IsBoolean() publicVisible?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateExtraServiceDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsIn(['PER_DAY', 'FIXED']) pricing?: 'PER_DAY' | 'FIXED';
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000) price?: number;
  @IsOptional() @IsBoolean() publicVisible?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class QuoteExtraDto {
  @IsUUID() extraServiceId!: string;
  @IsInt() @Min(1) @Max(20) quantity!: number;
}

export class QuoteDto {
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => QuoteExtraDto) extras?: QuoteExtraDto[];
  @IsOptional() @IsInt() @Min(0) @Max(5) additionalDrivers?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) discountPercent?: number;
}
