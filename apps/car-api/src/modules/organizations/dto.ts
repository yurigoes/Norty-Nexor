import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID,
  Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

class NotificationChannelsDto {
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() whatsapp?: boolean;
  @IsOptional() @IsBoolean() webhook?: boolean;
}

export class OrgSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(72) turnaroundHours?: number;
  @IsOptional() @IsBoolean() blockExpiredCnh?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(180) documentAlertDays?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) requireVehicleFor?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) requireWorkOrderFor?: string[];
  @IsOptional() @IsNumber() @Min(0) @Max(100) annualDepreciationPercent?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(20) lateFeePercent?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10) monthlyInterestPercent?: number;
  @IsOptional() @IsInt() @Min(1) @Max(720) requestExpiryHours?: number;
  @IsOptional() @ValidateNested() @Type(() => NotificationChannelsDto) notificationChannels?: NotificationChannelsDto;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @IsOptional() @IsString() @MaxLength(20) document?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => OrgSettingsDto) settings?: OrgSettingsDto;
}

export class BranchDto {
  @IsString() @Matches(/^[A-Z0-9-]{2,12}$/, { message: 'Código da filial: 2 a 12 letras maiúsculas, números ou hífen.' }) code!: string;
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(20) document?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(160) street?: string;
  @IsOptional() @IsString() @MaxLength(20) number?: string;
  @IsOptional() @IsString() @MaxLength(80) district?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @Length(2, 2) state?: string;
  @IsOptional() @IsString() @MaxLength(10) zip?: string;
  @IsOptional() @IsInt() @Min(0) @Max(72) turnaroundHours?: number | null;
  @IsOptional() @IsBoolean() publicVisible?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateBranchDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(20) document?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(160) street?: string;
  @IsOptional() @IsString() @MaxLength(20) number?: string;
  @IsOptional() @IsString() @MaxLength(80) district?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @Length(2, 2) state?: string;
  @IsOptional() @IsString() @MaxLength(10) zip?: string;
  @IsOptional() @IsInt() @Min(0) @Max(72) turnaroundHours?: number | null;
  @IsOptional() @IsBoolean() publicVisible?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class RoleDto {
  @IsString() @Length(2, 60) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) permissions!: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) permissions?: string[];
}

export class InviteUserDto {
  @IsEmail() email!: string;
  @IsString() @Length(2, 120) name!: string;
  @IsUUID() roleId!: string;
  @IsBoolean() allBranches!: boolean;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) branchIds?: string[];
  @IsOptional() @IsNumber() @Min(0) approvalLimit?: number | null;
  @IsOptional() @IsString() @MaxLength(80) title?: string;
}

export class UpdateMembershipDto {
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsBoolean() allBranches?: boolean;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) branchIds?: string[];
  @IsOptional() @IsNumber() @Min(0) approvalLimit?: number | null;
  @IsOptional() @IsString() @MaxLength(80) title?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class DecisionDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SupportTicketDto {
  @IsString() @Length(3, 160) subject!: string;
  @IsString() @Length(3, 5000) description!: string;
}

export class MessageDto {
  @IsString() @Length(1, 5000) body!: string;
}

export class AuditQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(60) entityType?: string;
  @IsOptional() @IsString() @MaxLength(60) entityId?: string;
  @IsOptional() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @IsUUID() actorUserId?: string;
  @IsOptional() @IsIn(['USER', 'PLATFORM', 'SUPPORT', 'CUSTOMER', 'SYSTEM', 'INTEGRATION', 'PUBLIC']) actorType?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
