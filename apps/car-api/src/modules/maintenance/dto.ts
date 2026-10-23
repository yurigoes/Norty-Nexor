import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min,
} from 'class-validator';
import { PageQueryDto, ToBool } from '../../common/pagination';

const STATUSES = ['OPEN', 'AWAITING_ESTIMATE', 'AWAITING_APPROVAL', 'AWAITING_PARTS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export class ServiceTypeDto {
  @IsString() @Length(2, 80) name!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateServiceTypeDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class WorkOrderDto {
  @IsUUID() vehicleUnitId!: string;
  @IsUUID() serviceTypeId!: string;
  @IsIn(['PREVENTIVE', 'CORRECTIVE']) kind!: 'PREVENTIVE' | 'CORRECTIVE';
  @IsString() @Length(3, 2000) description!: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() responsibleId?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) estimateAmount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000) odometerKm?: number;
  @IsOptional() @IsBoolean() blocksVehicle?: boolean;
  @IsOptional() @IsUUID() claimId?: string;
  @IsOptional() @IsUUID() maintenancePlanId?: string;
}

export class UpdateWorkOrderDto {
  @IsOptional() @IsString() @Length(3, 2000) description?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @IsUUID() responsibleId?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) estimateAmount?: number;
  @IsOptional() @IsString() @MaxLength(60) invoiceNumber?: string;
}

export class WorkOrderQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() claimId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @ToBool() @IsBoolean() open?: boolean;
}

export class StatusDto {
  @IsIn(STATUSES) to!: (typeof STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class WorkOrderItemDto {
  @IsIn(['PART', 'LABOR', 'SERVICE', 'EXPENSE']) type!: 'PART' | 'LABOR' | 'SERVICE' | 'EXPENSE';
  @IsOptional() @IsString() @Length(2, 300) description?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(100_000) quantity!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) unitCost?: number;
  @IsString() @Length(8, 80) idempotencyKey!: string;
}

export class CompleteDto {
  @IsOptional() @IsString() @MaxLength(60) invoiceNumber?: string;
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000) odometerKm?: number;
  @IsOptional() @IsDateString() payableDueDate?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class NoteDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class PlanDto {
  @IsUUID() vehicleUnitId!: string;
  @IsUUID() serviceTypeId!: string;
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsInt() @Min(100) @Max(500_000) intervalKm?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(3650) intervalDays?: number | null;
  @IsOptional() @IsDateString() lastDoneAt?: string | null;
  @IsOptional() @IsInt() @Min(0) lastDoneKm?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) alertKmBefore?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) alertDaysBefore?: number;
  @IsOptional() @IsBoolean() blockWhenOverdue?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsInt() @Min(100) @Max(500_000) intervalKm?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(3650) intervalDays?: number | null;
  @IsOptional() @IsDateString() lastDoneAt?: string | null;
  @IsOptional() @IsInt() @Min(0) lastDoneKm?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) alertKmBefore?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) alertDaysBefore?: number;
  @IsOptional() @IsBoolean() blockWhenOverdue?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class PlanQueryDto {
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsIn(['OK', 'DUE_SOON', 'OVERDUE', 'NO_BASELINE']) state?: string;
}
