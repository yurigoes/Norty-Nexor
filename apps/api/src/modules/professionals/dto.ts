import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

const CATEGORIES = [
  'eletrica', 'hidraulica', 'reformas', 'limpeza', 'climatizacao', 'montagem', 'chaveiro',
  'pintura', 'tecnologia', 'jardinagem', 'pet', 'aulas', 'mudancas', 'dedetizacao',
] as const;

export class CreateServiceRequestDto {
  @IsString() professionalId!: string;

  @IsString() @MinLength(4) @MaxLength(160)
  service!: string;

  @IsString() @MinLength(4) @MaxLength(2000)
  description!: string;

  @IsOptional() @IsDateString()
  preferredDate?: string;
}

export class CreateReviewDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating!: number;

  @IsString() @MaxLength(120)
  service!: string;

  @IsString() @MinLength(5) @MaxLength(1000)
  comment!: string;
}

export class CreateProfessionalDto {
  @IsString() @MinLength(3) @MaxLength(120)
  name!: string;

  @IsOptional() @IsString() @MaxLength(120)
  company?: string;

  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  @IsOptional() @IsString({ each: true })
  specialties?: string[];

  @IsString() @MaxLength(30)
  phone!: string;

  @IsOptional() @IsString() @MaxLength(180)
  email?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  bio?: string;

  @IsOptional() @IsString() @MaxLength(120)
  serviceArea?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  priceFrom?: number;

  @IsOptional() @IsBoolean()
  emergency?: boolean;
}
