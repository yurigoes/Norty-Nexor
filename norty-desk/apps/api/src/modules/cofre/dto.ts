import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { TIPOS_DE_SEGREDO } from '@norty-desk/shared';

export class EscreverSegredoDto {
  @IsIn(TIPOS_DE_SEGREDO) kind!: (typeof TIPOS_DE_SEGREDO)[number];

  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(1) @MaxLength(200) login!: string;

  /**
   * Omitida na edição, mantém a guardada.
   *
   * Sem mínimo: a senha é de **outro sistema**, e recusar a que ele
   * aceita seria impedir de guardar justamente a que existe. O mínimo
   * do Desk vale para a senha do Desk.
   */
  @IsOptional() @IsString() @MaxLength(500) senha?: string;

  @IsOptional() @IsString() @MaxLength(500) url?: string | null;
  @IsOptional() @IsUUID() assetId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) sistema?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notas?: string | null;
}

export class CompartilharDto {
  @IsUUID() userId!: string;

  /** Omitido ou nulo é "sem prazo". */
  @IsOptional() @IsDateString() expiresAt?: string | null;
}
