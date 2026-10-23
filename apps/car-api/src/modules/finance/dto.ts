import { Transform } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

export const RECEIVABLE_KINDS = ['RENTAL', 'MONTHLY', 'EXTRA', 'DAMAGE', 'INFRACTION_REIMBURSEMENT', 'FEE', 'VEHICLE_SALE', 'OTHER'] as const;
export const PAYABLE_KINDS = [
  'MAINTENANCE', 'PARTS', 'INSURANCE', 'TAX', 'FINE', 'FUEL', 'PURCHASE', 'SALE_PREPARATION', 'DOCUMENTATION', 'VEHICLE_ACQUISITION', 'OTHER',
] as const;
export const PAYMENT_METHODS = ['PIX', 'BOLETO', 'CARD', 'CASH', 'TRANSFER'] as const;

const toBool = () => Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined));

export class TitleQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['OPEN', 'PARTIAL', 'PAID', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() @MaxLength(40) kind?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @toBool() @IsBoolean() overdue?: boolean;
  @IsOptional() @toBool() @IsBoolean() open?: boolean;
  @IsOptional() @IsIn(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']) approval?: string;
}

export class CreateReceivableDto {
  @IsUUID() branchId!: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsIn(RECEIVABLE_KINDS) kind!: (typeof RECEIVABLE_KINDS)[number];
  @IsString() @Length(2, 200) description!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) amount!: number;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsUUID() costCenterId?: string;
}

export class CreatePayableDto {
  @IsUUID() branchId!: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsIn(PAYABLE_KINDS) kind!: (typeof PAYABLE_KINDS)[number];
  @IsString() @Length(2, 200) description!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) amount!: number;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
  @IsOptional() @IsString() @MaxLength(60) documentNumber?: string;
}

export class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class PaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) amount!: number;
  @IsIn(PAYMENT_METHODS) method!: (typeof PAYMENT_METHODS)[number];
  @IsOptional() @IsDateString() paidAt?: string;
  /** Chave gerada pelo cliente por operação: repetir não duplica a baixa. */
  @IsString() @Matches(/^[\w:-]{8,100}$/, { message: 'idempotencyKey inválida.' }) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(120) bankReference?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class PaymentQueryDto extends PageQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['IN', 'OUT']) direction?: 'IN' | 'OUT';
  @IsOptional() @toBool() @IsBoolean() reconciled?: boolean;
  @IsOptional() @IsIn(['PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED', 'REVERSED']) status?: string;
  @IsOptional() @IsString() @MaxLength(20) method?: string;
}

export class ReconcileDto {
  @IsOptional() @IsString() @MaxLength(120) bankReference?: string;
}

export class CostCenterDto {
  @IsString() @Matches(/^[A-Z0-9_-]{2,16}$/, { message: 'Código: 2 a 16 letras maiúsculas, números, _ ou -.' }) code!: string;
  @IsString() @Length(2, 80) name!: string;
}

export class UpdateCostCenterDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class PeriodQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsIn(['day', 'month']) groupBy?: 'day' | 'month';
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(1) @Max(36) months?: number;
}
