import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const TYPES = ['ACCIDENT', 'COLLISION', 'DAMAGE', 'THEFT', 'ROBBERY', 'GLASS', 'NATURAL_EVENT', 'OTHER'];
const STATUSES = ['OPEN', 'INSURER_NOTIFIED', 'UNDER_REVIEW', 'REPAIRING', 'INDEMNIFIED', 'DENIED', 'CLOSED'];
const PAYABLE_KINDS = ['MAINTENANCE', 'PARTS', 'INSURANCE', 'DOCUMENTATION', 'OTHER'];

export class PolicyDto {
  @IsUUID() insurerId!: string;
  @IsString() @Length(2, 60) policyNumber!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) coverage?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) deductible?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) premium?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePolicyDto {
  @IsOptional() @IsString() @Length(2, 60) policyNumber?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) coverage?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) deductible?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) premium?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class PolicyVehiclesDto {
  @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) vehicleUnitIds!: string[];
}

export class ClaimQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsIn(TYPES) type?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class CreateClaimDto {
  @IsUUID() vehicleUnitId!: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsIn(TYPES) type!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsString() @Length(3, 4000) description!: string;
  @IsOptional() @IsUUID() policyId?: string;
  @IsOptional() @IsString() @MaxLength(60) insurerClaimNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) policeReportNumber?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) deductibleAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) estimatedCost?: number;
  @IsOptional() @IsUUID() responsibleId?: string;
  @IsBoolean() blocksVehicle!: boolean;
}

export class UpdateClaimDto {
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsString() @Length(3, 4000) description?: string;
  @IsOptional() @IsUUID() policyId?: string | null;
  @IsOptional() @IsUUID() driverId?: string | null;
  @IsOptional() @IsUUID() contractId?: string | null;
  @IsOptional() @IsString() @MaxLength(60) insurerClaimNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) policeReportNumber?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) deductibleAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) estimatedCost?: number;
  @IsOptional() @IsUUID() responsibleId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class ClaimStatusDto {
  @IsIn(STATUSES) status!: string;
  @IsString() @Length(3, 1000) note!: string;
}

export class ClaimNoteDto {
  @IsString() @Length(3, 2000) note!: string;
}

export class ClaimExpenseDto {
  @IsIn(PAYABLE_KINDS) kind!: string;
  @IsString() @Length(3, 300) description!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) amount!: number;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @MaxLength(60) documentNumber?: string;
}

export class ClaimIndemnityDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) amount!: number;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}
