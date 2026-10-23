import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const ADMIN = ['RECEIVED', 'UNDER_REVIEW', 'AWAITING_DRIVER_ID', 'DRIVER_INDICATED', 'APPEALING', 'GRANTED', 'DENIED', 'CANCELLED', 'FINISHED'];
const FIN = ['PENDING', 'BILLING', 'PAID_BY_COMPANY', 'AWAITING_REIMBURSEMENT', 'REIMBURSED', 'CANCELLED'];

export class InfractionQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(ADMIN) adminStatus?: string;
  @IsOptional() @IsIn(FIN) financialStatus?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  /** Só infrações com algum prazo (indicação, defesa, vencimento) nos próximos N dias. */
  @IsOptional() @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value))) @IsInt() @Min(0) @Max(365) deadlineDays?: number;
}

export class CreateInfractionDto {
  @IsString() @Length(3, 40) autoNumber!: string;
  @IsString() @Length(2, 120) authority!: string;
  @IsOptional() @IsString() @MaxLength(20) infractionCode?: string;
  @IsString() @Length(3, 500) description!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsUUID() vehicleUnitId!: string;
  @IsOptional() @IsDateString() notifiedAt?: string;
  @IsOptional() @IsDateString() driverIndicationDeadline?: string;
  @IsOptional() @IsDateString() defenseDeadline?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) originalAmount!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) interestAmount?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(30) points?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateInfractionDto {
  @IsOptional() @IsString() @Length(3, 40) autoNumber?: string;
  @IsOptional() @IsString() @Length(2, 120) authority?: string;
  @IsOptional() @IsString() @MaxLength(20) infractionCode?: string;
  @IsOptional() @IsString() @Length(3, 500) description?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsDateString() notifiedAt?: string;
  @IsOptional() @IsDateString() driverIndicationDeadline?: string;
  @IsOptional() @IsDateString() defenseDeadline?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) originalAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) interestAmount?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(30) points?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  /** Observação registrada no histórico da alteração. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class InfractionStatusDto {
  @IsOptional() @IsIn(ADMIN) adminStatus?: string;
  @IsOptional() @IsIn(FIN) financialStatus?: string;
  @IsString() @Length(3, 500) note!: string;
}

export class IndicateDriverDto {
  @IsUUID() driverId!: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class PayInfractionDto {
  @IsDateString() dueDate!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ChargeInfractionDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AppealDto {
  @IsString() @Length(2, 80) protocol!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AppealResultDto {
  @IsIn(['GRANTED', 'DENIED']) result!: 'GRANTED' | 'DENIED';
  @IsString() @Length(3, 1000) note!: string;
}
