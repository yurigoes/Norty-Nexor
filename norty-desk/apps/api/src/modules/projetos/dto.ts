import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
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
import { PROJECT_STATUSES, PROJECT_TASK_STATUSES } from '@norty-desk/shared';

/** Campo opcional que aceita `null` (ou vazio) para limpar. */
const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;
const booleano = ({ value }: { value: unknown }) => value === true || value === 'true';

export class BuscarProjetosDto {
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: (typeof PROJECT_STATUSES)[number];
  /** Por padrão a lista esconde concluídos e cancelados. */
  @IsOptional() @Transform(booleano) @IsBoolean() incluirEncerrados?: boolean;
}

export class EscreverProjetoDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(40) code?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: (typeof PROJECT_STATUSES)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) priority?: number;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() managerId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() teamId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() parentId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() plannedStart?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() plannedEnd?: string | null;
}

export class EditarProjetoDto extends EscreverProjetoDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) declare name: string;
}

export class EscreverTarefaProjetoDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsIn(PROJECT_TASK_STATUSES) status?: (typeof PROJECT_TASK_STATUSES)[number];
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assigneeId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() parentId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() plannedStart?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() plannedEnd?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) plannedMinutes?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) percentDone?: number;
  /** Somado ao já apontado. Teto de 31 dias num apontamento: mais que isso é engano de unidade. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(31 * 24 * 60) addSpentMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) position?: number;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() dependsOnId?: string | null;
}

export class EditarTarefaProjetoDto extends EscreverTarefaProjetoDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) declare name: string;
}

export class VincularChamadoDto {
  @Type(() => Number) @IsInt() @Min(1) number!: number;
}
