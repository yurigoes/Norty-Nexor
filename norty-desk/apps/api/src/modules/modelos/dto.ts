import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TEMPLATE_KINDS, type TemplateKind } from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const textoVirandoBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class EscreverModeloDto {
  @IsIn(TEMPLATE_KINDS) kind!: TemplateKind;

  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @IsBoolean() isInternal?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EditarModeloDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20000) body?: string;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @IsBoolean() isInternal?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class BuscarModelosDto {
  @IsOptional() @IsIn(TEMPLATE_KINDS) kind?: TemplateKind;
  /** A categoria do chamado: traz os dela e os sem categoria. */
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @Transform(textoVirandoBooleano) @IsBoolean() incluirInativos?: boolean;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}

export class UsarModeloDto {
  @Type(() => String) @IsUUID() ticketId!: string;
}
