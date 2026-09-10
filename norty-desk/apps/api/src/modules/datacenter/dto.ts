import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { RACK_FACES } from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class EscreverSalaDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() locationId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EditarSalaDto extends EscreverSalaDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
}

export class EscreverRackDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() roomId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) units?: number;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(120) position?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

export class EditarRackDto extends EscreverRackDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
}

export class ColocarNoRackDto {
  @IsUUID() assetId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(60) positionU!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) heightU?: number;
  @IsOptional() @IsIn(RACK_FACES) face?: (typeof RACK_FACES)[number];
}

export class MoverNoRackDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) positionU?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) heightU?: number;
  @IsOptional() @IsIn(RACK_FACES) face?: (typeof RACK_FACES)[number];
}
