import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FORM_FIELD_TYPES, type FormFieldType } from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class OpcaoDto {
  @IsString() @MinLength(1) @MaxLength(80) value!: string;
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
}

export class CampoDto {
  @IsString() @MinLength(1) @MaxLength(40) key!: string;
  @IsString() @MinLength(1) @MaxLength(120) label!: string;
  @IsIn(FORM_FIELD_TYPES) type!: FormFieldType;
  @IsBoolean() required!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => OpcaoDto)
  options?: OpcaoDto[];

  @IsOptional() @IsString() @MaxLength(200) help?: string;
  @IsOptional() @IsBoolean() internal?: boolean;
}

export class SchemaDto {
  /**
   * Teto de 40 campos.
   *
   * Formulário mais longo que isso ninguém preenche — e é justamente o
   * defeito das 12 tabelas de `tickettemplate*` do GLPI, que deixam
   * montar uma tela que o solicitante abandona no meio.
   */
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => CampoDto)
  fields!: CampoDto[];
}

export class EscreverFormularioDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;

  @ValidateNested() @Type(() => SchemaDto) schema!: SchemaDto;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isModel?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(200) description?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(999) position?: number;
}

export class EditarFormularioDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;

  @IsOptional() @ValidateNested() @Type(() => SchemaDto) schema?: SchemaDto;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isModel?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(200) description?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(999) position?: number;
}
