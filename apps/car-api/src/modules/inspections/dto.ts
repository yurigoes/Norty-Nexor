import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { VEHICLE_REGIONS } from '@nortycar/shared';
import { PageQueryDto } from '../../common/pagination';

const TYPES = ['DELIVERY', 'PERIODIC', 'DRIVER_CHANGE', 'RETURN'] as const;
const REGIONS = VEHICLE_REGIONS.map((r) => r.key);

export class TemplateItemDto {
  @IsString() @Matches(/^[a-z0-9_]{2,40}$/, { message: 'Chave do item: letras minúsculas, números e _.' }) key!: string;
  @IsString() @Length(2, 80) label!: string;
  @IsString() @Length(2, 40) area!: string;
}

export class TemplateDto {
  @IsString() @Length(2, 80) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(120) @ValidateNested({ each: true }) @Type(() => TemplateItemDto) items!: TemplateItemDto[];
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(120) @ValidateNested({ each: true }) @Type(() => TemplateItemDto) items?: TemplateItemDto[];
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class CreateInspectionDto {
  @IsIn(TYPES) type!: (typeof TYPES)[number];
  @IsUUID() vehicleUnitId!: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() templateId?: string;
}

export class UpdateInspectionDto {
  @IsOptional() @IsInt() @Min(0) @Max(5_000_000) odometerKm?: number;
  @IsOptional() @IsInt() @Min(0) @Max(8) fuelEighths?: number;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsString() @MaxLength(4000) pendencies?: string;
  @IsOptional() @IsUUID() driverId?: string | null;
}

export class ItemDto {
  @IsIn(['OK', 'DAMAGED', 'MISSING', 'NA']) status!: 'OK' | 'DAMAGED' | 'MISSING' | 'NA';
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

export class DamageDto {
  @IsIn(REGIONS) region!: string;
  @IsIn(['LIGHT', 'MEDIUM', 'SEVERE']) severity!: 'LIGHT' | 'MEDIUM' | 'SEVERE';
  @IsString() @Length(3, 1000) description!: string;
}

export class PhotoDto {
  @IsUUID() fileId!: string;
  @IsOptional() @IsString() @MaxLength(40) itemKey?: string;
  @IsOptional() @IsIn(REGIONS) region?: string;
  @IsOptional() @IsString() @MaxLength(300) caption?: string;
}

export class CompleteInspectionDto {
  @IsIn(['SIGNATURE_DRAWN', 'ACKNOWLEDGED_IN_PERSON']) confirmationType!: 'SIGNATURE_DRAWN' | 'ACKNOWLEDGED_IN_PERSON';
  @IsOptional() @IsUUID() signatureFileId?: string;
  @IsString() @Length(3, 120) signerName!: string;
}

export class InspectionQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(TYPES) type?: string;
  @IsOptional() @IsIn(['DRAFT', 'COMPLETED', 'APPROVED']) status?: string;
  @IsOptional() @IsUUID() vehicleUnitId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class CompareQueryDto {
  @IsUUID() base!: string;
  @IsUUID() current!: string;
}
