import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { PROBLEM_STATUSES, type ProblemStatus } from '@norty-desk/shared';

/** Campo de texto opcional que aceita `null` para limpar. */
const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** `?erroConhecido=true` chega como string na query. */
const textoVirandoBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CriarProblemaDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) @MaxLength(20000) description!: string;

  @IsOptional() @IsIn(PROBLEM_STATUSES) status?: ProblemStatus;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) urgency?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) impact?: number;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedTeamId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedUserId?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000) rootCause?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000) workaround?: string | null;

  @IsOptional() @IsBoolean() isKnownError?: boolean;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() articleId?: string | null;

  /**
   * Chamados que já sofrem deste problema.
   *
   * Abrir o problema a partir dos chamados que o revelaram é o caminho
   * de sempre — obrigar a criar primeiro e vincular depois faria a
   * ligação ficar para "mais tarde", que é nunca.
   */
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) ticketIds?: string[];
}

/**
 * Editar não repete os obrigatórios.
 *
 * Herdar de `CriarProblemaDto` faria quem só quer escrever a causa raiz
 * reenviar título e descrição inteiros — e `forbidNonWhitelisted` não
 * perdoa quem esquece.
 */
export class EditarProblemaDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(20000) description?: string;

  @IsOptional() @IsIn(PROBLEM_STATUSES) status?: ProblemStatus;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) urgency?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) impact?: number;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedTeamId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedUserId?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000) rootCause?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000) workaround?: string | null;

  @IsOptional() @IsBoolean() isKnownError?: boolean;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() articleId?: string | null;
}

export class BuscarProblemasDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(PROBLEM_STATUSES) status?: ProblemStatus;
  @IsOptional() @Transform(textoVirandoBooleano) @IsBoolean() isKnownError?: boolean;
  /** Sem isto, a lista abre em RESOLVIDO e FECHADO junto com o resto. */
  @IsOptional() @Transform(textoVirandoBooleano) @IsBoolean() abertos?: boolean;
  @IsOptional() @IsUUID() assignedTeamId?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class VincularChamadoDto {
  @IsUUID() ticketId!: string;
}

export class NotaDoProblemaDto {
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;
}
