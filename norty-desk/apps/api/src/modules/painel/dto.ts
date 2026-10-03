import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ORDENS_DO_PAINEL, TIPOS_DE_ZONA, type OrdemDoPainel, type TipoDeZona } from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/**
 * A grade do painel.
 *
 * Os limites são os mesmos do `CHECK` no banco, e de propósito: 64
 * colunas cobrem o painel de 48 portas com folga, e 8 linhas cobrem
 * qualquer coisa que se empilhe num U. Quem pedir mais está descrevendo
 * outra coisa — e um painel de mil colunas não desenha, trava a tela.
 */
export class EscreverPainelDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(64) columns!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(8) rows?: number;
  @IsOptional() @IsIn(ORDENS_DO_PAINEL) numbering?: OrdemDoPainel;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) startAt?: number;
  @IsOptional()
  @Transform(vazioVirandoNulo)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(512)
  slots?: number | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
}

/** A exceção: console, SFP fora da fileira, furo no painel. */
export class EscreverZonaDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(64) column!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(8) row!: number;
  @IsOptional() @IsIn(TIPOS_DE_ZONA) kind?: TipoDeZona;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(40) label?: string | null;
  @IsOptional()
  @Transform(vazioVirandoNulo)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  portNumber?: number | null;
}
