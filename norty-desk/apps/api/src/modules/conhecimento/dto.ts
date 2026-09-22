import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class EscreverArtigoDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(1) @MaxLength(100_000) body!: string;

  @IsOptional() @IsUUID() categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  // A etiqueta é busca exata: normalizar aqui evita "Impressora" e
  // "impressora" virarem duas etiquetas que não se encontram.
  @Transform(({ value }) =>
    Array.isArray(value)
      ? [...new Set(value.map((v: unknown) => String(v).trim().toLowerCase()).filter(Boolean))]
      : value,
  )
  keywords?: string[];

  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() isArchived?: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class EditarArtigoDto extends EscreverArtigoDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) declare title: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100_000) declare body: string;
}

export class BuscarArtigosDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsUUID() categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  public?: boolean;

  /** Por padrão o arquivado não aparece: ele foi aposentado de propósito. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  arquivados?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/**
 * A resolução de um chamado, indo para o índice.
 *
 * Sem `categoryId`: a categoria vem do chamado, que é quem foi
 * classificado por quem atendeu. Deixar a tela mandar outra criaria
 * divergência entre o assunto do chamado e o da resolução dele.
 */
export class RegistrarResolucaoDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(10) body!: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(40, { each: true })
  keywords?: string[];
}
