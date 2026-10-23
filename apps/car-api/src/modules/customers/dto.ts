import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PageQueryDto, ToBool } from '../../common/pagination';

const PAYMENT = ['PIX', 'BOLETO', 'CARD', 'CASH', 'TRANSFER'];
export const CNH_CATEGORIES = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];

class EmergencyContactDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(8, 30) phone!: string;
  @IsOptional() @IsString() @MaxLength(60) relationship?: string;
}

export class CustomerQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['ACTIVE', 'BLOCKED', 'PENDING_REVIEW']) status?: string;
  @IsOptional() @IsIn(['PF', 'PJ']) type?: string;
}

class CustomerFields {
  @IsOptional() @IsString() @MaxLength(160) tradeName?: string | null;
  @IsOptional() @IsDateString() birthDate?: string | null;
  @IsOptional() @IsEmail({}, { message: 'E-mail inválido.' }) email?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(160) street?: string | null;
  @IsOptional() @IsString() @MaxLength(20) number?: string | null;
  @IsOptional() @IsString() @MaxLength(80) complement?: string | null;
  @IsOptional() @IsString() @MaxLength(80) district?: string | null;
  @IsOptional() @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @IsString() @Length(2, 2) state?: string | null;
  @IsOptional() @IsString() @MaxLength(10) zip?: string | null;
  @IsOptional() @ValidateNested() @Type(() => EmergencyContactDto) emergencyContact?: EmergencyContactDto | null;
  @IsOptional() @IsIn(PAYMENT) preferredPayment?: string | null;
  @IsOptional() @IsString() @MaxLength(3000) internalNotes?: string | null;
}

export class CreateCustomerDto extends CustomerFields {
  @IsIn(['PF', 'PJ']) type!: 'PF' | 'PJ';
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(11, 18) document!: string;
}

export class UpdateCustomerDto extends CustomerFields {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @Length(11, 18) document?: string;
}

export class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class DriverQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value))) @IsInt() @Min(0) @Max(365) cnhExpiringDays?: number;
  @IsOptional() @ToBool() @IsBoolean() includeInactive?: boolean;
}

class CnhFields {
  @IsOptional() @IsDateString() cnhFirstIssueAt?: string | null;
}

export class AsDriverDto extends CnhFields {
  @Matches(/^\d{9,11}$/, { message: 'Número da CNH: 9 a 11 dígitos.' }) cnhNumber!: string;
  @IsIn(CNH_CATEGORIES, { message: 'Categoria de CNH inválida.' }) cnhCategory!: string;
  @IsDateString() cnhExpiresAt!: string;
}

export class CreateDriverDto extends AsDriverDto {
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(11, 14) cpf!: string;
  @IsOptional() @IsDateString() birthDate?: string | null;
  @IsOptional() @IsEmail({}, { message: 'E-mail inválido.' }) email?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

export class UpdateDriverDto extends CnhFields {
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsDateString() birthDate?: string | null;
  @IsOptional() @IsEmail({}, { message: 'E-mail inválido.' }) email?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @Matches(/^\d{9,11}$/, { message: 'Número da CNH: 9 a 11 dígitos.' }) cnhNumber?: string;
  @IsOptional() @IsIn(CNH_CATEGORIES, { message: 'Categoria de CNH inválida.' }) cnhCategory?: string;
  @IsOptional() @IsDateString() cnhExpiresAt?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}
