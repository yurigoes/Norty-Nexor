import {
  IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min,
} from 'class-validator';

const FUELS = ['FLEX', 'GASOLINE', 'ETHANOL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'CNG'];
const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC', 'CVT', 'AUTOMATED'];

export class CategoryDto {
  @IsString() @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'Código: 2 a 20 letras maiúsculas, números, hífen ou sublinhado.' }) code!: string;
  @IsString() @Length(2, 60) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class MakeDto {
  @IsString() @Length(2, 60) name!: string;
}

export class ModelDto {
  @IsOptional() @IsUUID() makeId?: string;
  /** Alternativa a makeId: cria a marca se ainda não existir. */
  @IsOptional() @IsString() @Length(2, 60) makeName?: string;
  @IsUUID() categoryId!: string;
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsString() @MaxLength(40) bodyType?: string;
  @IsOptional() @IsInt() @Min(1) @Max(60) seats?: number;
  @IsOptional() @IsInt() @Min(1) @Max(6) doors?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5000) trunkLiters?: number;
  @IsOptional() @IsInt() @Min(1) @Max(400) tankLiters?: number;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsObject() specs?: Record<string, unknown>;
  @IsOptional() @IsArray() hotspots?: unknown[];
  @IsOptional() @IsBoolean() publicVisible?: boolean;
}

export class UpdateModelDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(40) bodyType?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(60) seats?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(6) doors?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(5000) trunkLiters?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(400) tankLiters?: number | null;
  @IsOptional() @IsString() @MaxLength(3000) description?: string | null;
  @IsOptional() @IsObject() specs?: Record<string, unknown>;
  @IsOptional() @IsArray() hotspots?: unknown[];
  @IsOptional() @IsUUID() coverFileId?: string | null;
  @IsOptional() @IsUUID() model3dFileId?: string | null;
  @IsOptional() @IsBoolean() publicVisible?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class VersionDto {
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsString() @MaxLength(60) engine?: string;
  @IsOptional() @IsIn(FUELS) fuel?: string;
  @IsOptional() @IsIn(TRANSMISSIONS) transmission?: string;
  @IsOptional() @IsObject() specs?: Record<string, unknown>;
}

export class UpdateVersionDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(60) engine?: string | null;
  @IsOptional() @IsIn(FUELS) fuel?: string | null;
  @IsOptional() @IsIn(TRANSMISSIONS) transmission?: string | null;
  @IsOptional() @IsObject() specs?: Record<string, unknown>;
}
