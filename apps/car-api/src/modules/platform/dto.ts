import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max,
  MaxLength, Min,
} from 'class-validator';

export class CreateOrganizationDto {
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @IsOptional() @IsString() @MaxLength(20) document?: string;
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/, { message: 'Identificador: 3 a 42 letras minúsculas, números ou hífen.' }) slug!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsUUID() planId!: string;
  @IsOptional() @IsInt() @Min(0) @Max(90) trialDays?: number;
  @IsString() @Matches(/^[A-Z0-9-]{2,12}$/, { message: 'Código da filial: 2 a 12 letras maiúsculas, números ou hífen.' }) branchCode!: string;
  @IsString() @Length(2, 120) branchName!: string;
  @IsOptional() @IsString() @MaxLength(80) branchCity?: string;
  @IsOptional() @IsString() @Length(2, 2) branchState?: string;
  @IsEmail() ownerEmail!: string;
  @IsString() @Length(2, 120) ownerName!: string;
}

export class UpdateOrganizationAdminDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) extraModules?: string[];
}

export class StatusChangeDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'CLOSED']) status!: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  @IsString() @Length(5, 500) reason!: string;
}

export class PlanDto {
  @IsString() @Matches(/^[a-z0-9-]{2,40}$/, { message: 'Código: letras minúsculas, números ou hífen.' }) code!: string;
  @IsString() @Length(2, 60) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) priceMonthly!: number;
  @IsOptional() @IsInt() @Min(1) maxVehicles?: number | null;
  @IsOptional() @IsInt() @Min(1) maxBranches?: number | null;
  @IsOptional() @IsInt() @Min(1) maxUsers?: number | null;
  @IsArray() @IsString({ each: true }) modules!: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) priceMonthly?: number;
  @IsOptional() @IsInt() @Min(1) maxVehicles?: number | null;
  @IsOptional() @IsInt() @Min(1) maxBranches?: number | null;
  @IsOptional() @IsInt() @Min(1) maxUsers?: number | null;
  @IsOptional() @IsArray() @IsString({ each: true }) modules?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SubscriptionDto {
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsIn(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']) status?: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) priceOverride?: number | null;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class GenerateInvoicesDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Competência no formato AAAA-MM.' }) competence!: string;
  @IsInt() @Min(1) @Max(28) dueDay!: number;
}

export class PayInvoiceDto {
  @IsString() @Length(2, 200) reference!: string;
}

export class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class TicketUpdateDto {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']) status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  @IsOptional() @IsString() @Length(1, 5000) message?: string;
}

export class GrantRequestDto {
  @IsUUID() organizationId!: string;
  @IsString() @Length(10, 500) purpose!: string;
  @IsArray() @ArrayMaxSize(80) @IsString({ each: true }) scope!: string[];
  @IsInt() @Min(1) @Max(72) durationHours!: number;
}

export class StaffDto {
  @IsEmail() email!: string;
  @IsString() @Length(2, 120) name!: string;
  @IsIn(['SUPPORT', 'ADMIN', 'SUPER']) platformRole!: 'SUPPORT' | 'ADMIN' | 'SUPER';
}

export class UpdateStaffDto {
  @IsOptional() @IsIn(['NONE', 'SUPPORT', 'ADMIN', 'SUPER']) platformRole?: 'NONE' | 'SUPPORT' | 'ADMIN' | 'SUPER';
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SettingDto {
  @IsString() @Matches(/^[a-z][a-zA-Z0-9_.]{1,60}$/) key!: string;
  @IsOptional() value?: unknown;
}

export class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
}
