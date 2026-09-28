import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ASSET_KINDS, type AssetKind } from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class EscreverLocalizacaoDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() parentId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(500) notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EscreverFabricanteDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

/** Um nome a mais pelo qual o fabricante atende. */
export class ApelidarFabricanteDto {
  @IsString() @MinLength(1) @MaxLength(120) alias!: string;
}

/**
 * Qual cadastro duplicado some dentro deste.
 *
 * Serve fabricante e modelo: a pergunta da junção é a mesma nos dois, e
 * duplicar o DTO só para trocar o nome daria duas validações para
 * manter.
 */
export class JuntarCadastrosDto {
  @IsUUID() absorvidoId!: string;
}

export class EscreverModeloDeAtivoDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsIn(ASSET_KINDS) kind?: AssetKind;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() manufacturerId?: string | null;
}

/** Um nome a mais pelo qual o modelo atende. */
export class ApelidarModeloDto {
  @IsString() @MinLength(1) @MaxLength(160) alias!: string;
}

/**
 * Uma regra do dicionário de sistema operacional.
 *
 * O `caption` é o texto como aparece na máquina; o servidor o normaliza.
 * Deixar a chave normalizada vir do cliente daria duas normalizações,
 * e a do cliente é a que envelhece.
 */
export class EscreverRegraDeSistemaDto {
  @IsString() @MinLength(1) @MaxLength(200) caption!: string;
  @IsString() @MinLength(1) @MaxLength(120) product!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(120) edition?: string | null;
}
