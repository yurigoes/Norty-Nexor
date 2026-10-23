import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';
import { QuoteExtraDto } from '../pricing/dto';

export class CreateContractDto {
  @IsIn(['PERIOD', 'LONG_TERM']) kind!: 'PERIOD' | 'LONG_TERM';
  @IsUUID() branchId!: string;
  @IsUUID() customerId!: string;
  @IsUUID() driverId!: string;
  @IsUUID() vehicleUnitId!: string;
  @IsDateString() startAt!: string;
  /** Período: obrigatório. Longo prazo: calculado por startAt + termMonths. */
  @IsOptional() @IsDateString() endAt?: string;
  // Período
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => QuoteExtraDto) extras?: QuoteExtraDto[];
  @IsOptional() @IsInt() @Min(0) @Max(5) additionalDrivers?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) totalAmount?: number;
  // Longo prazo
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monthlyAmount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) termMonths?: number;
  @IsOptional() @IsInt() @Min(1) @Max(28) billingDay?: number;
  @IsOptional() @IsString() @MaxLength(40) adjustmentIndex?: string;
  // Condições
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) kmAllowance?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) extraKmRate?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) depositRequired?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(20) lateFeePercent?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10) monthlyInterestPercent?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(120, { each: true }) includedServices?: string[];
  @IsOptional() @IsString() @MaxLength(20_000) terms?: string;
}

export class ContractQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'CLOSED', 'TERMINATED', 'CANCELLED']) status?: string;
  @IsOptional() @IsIn(['PERIOD', 'LONG_TERM']) kind?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(0) @Max(365) expiringDays?: number;
}

export class ActivateDto {
  /** Entrega sem o caução integral: exige deposits.approve e motivo. */
  @IsOptional() @IsBoolean() waiveDeposit?: boolean;
  @IsOptional() @IsString() @Length(3, 500) waiveReason?: string;
  /** Vencimento do título da locação (período). Padrão: hoje. */
  @IsOptional() @IsDateString() dueDate?: string;
}

export class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class SwapDriverDto {
  @IsUUID() driverId!: string;
  @IsString() @Length(3, 500) reason!: string;
  @IsOptional() @IsUUID() inspectionId?: string;
}

export class SwapVehicleDto {
  @IsUUID() newVehicleUnitId!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class ExtendDto {
  /** Período: nova data de devolução. */
  @IsOptional() @IsDateString() newEndAt?: string;
  /** Longo prazo: meses adicionais. */
  @IsOptional() @IsInt() @Min(1) @Max(36) additionalMonths?: number;
  @IsString() @Length(3, 500) reason!: string;
}

export class AmendDto {
  @IsString() @Length(3, 500) reason!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monthlyAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) totalAmount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) kmAllowance?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) extraKmRate?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) depositRequired?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(20) lateFeePercent?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10) monthlyInterestPercent?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) includedServices?: string[];
  @IsOptional() @IsString() @MaxLength(20_000) terms?: string;
  @IsOptional() @IsString() @MaxLength(40) adjustmentIndex?: string;
  @IsOptional() @IsDateString() nextAdjustmentAt?: string;
}

export class ChargeItemDto {
  @IsString() @Length(2, 200) description!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) amount!: number;
}

export class CloseDto {
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ChargeItemDto) damages?: ChargeItemDto[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000) fuelCharge?: number;
  /** Dispensa diárias de atraso e km excedente (exige contracts.price_override). */
  @IsOptional() @IsBoolean() waiveExtras?: boolean;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class TerminateDto extends CloseDto {
  @IsString() @Length(3, 500) reason!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) penaltyAmount?: number;
  /** Veículo não devolvido (roubo, apreensão): encerra sem vistoria de devolução. */
  @IsOptional() @IsBoolean() vehicleNotReturned?: boolean;
}

export class RenewDto {
  @IsInt() @Min(1) @Max(60) termMonths!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monthlyAmount?: number;
  @IsString() @Length(3, 500) reason!: string;
}

export class SignatureDto {
  @IsUUID() fileId!: string;
}

export class GenerateBillingDto {
  @IsOptional() @IsInt() @Min(1) @Max(120) horizonDays?: number;
}
