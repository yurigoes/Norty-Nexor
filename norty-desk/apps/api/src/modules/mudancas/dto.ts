import { Transform, Type } from 'class-transformer';
import {
  IsArray,
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
import {
  CHANGE_KINDS,
  CHANGE_RISKS,
  CHANGE_STATUSES,
  type ChangeKind,
  type ChangeRisk,
  type ChangeStatus,
} from '@norty-desk/shared';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const textoVirandoBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CriarMudancaDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) @MaxLength(20000) description!: string;

  @IsOptional() @IsIn(CHANGE_KINDS) kind?: ChangeKind;
  @IsOptional() @IsIn(CHANGE_RISKS) risk?: ChangeRisk;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedTeamId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedUserId?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000)
  implementationPlan?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000)
  testPlan?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000)
  rollbackPlan?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() windowStart?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() windowEnd?: string | null;

  /** A mudança que remove a causa de um problema. */
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() problemId?: string | null;

  /** Os chamados que esta mudança carrega. */
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) ticketIds?: string[];
}

/** Editar não repete os obrigatórios: quem só ajusta a janela não reenvia o plano. */
export class EditarMudancaDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(20000) description?: string;

  @IsOptional() @IsIn(CHANGE_STATUSES) status?: ChangeStatus;
  @IsOptional() @IsIn(CHANGE_KINDS) kind?: ChangeKind;
  @IsOptional() @IsIn(CHANGE_RISKS) risk?: ChangeRisk;

  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() categoryId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedTeamId?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() assignedUserId?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000)
  implementationPlan?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000)
  testPlan?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000)
  rollbackPlan?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() windowStart?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsDateString() windowEnd?: string | null;

  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(20000) outcome?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsUUID() problemId?: string | null;
}

/**
 * A execução tem rota própria, e não é um `PATCH` de status.
 *
 * Começar, concluir e reverter carimbam horário e escrevem o desfecho —
 * três efeitos que a edição genérica não deve poder disparar por
 * descuido. E a permissão é outra: quem executa não é quem aprova.
 */
export class ExecutarMudancaDto {
  @IsIn(['INICIAR', 'CONCLUIR', 'REVERTER'])
  acao!: 'INICIAR' | 'CONCLUIR' | 'REVERTER';

  /** O que de fato aconteceu. Obrigatório ao concluir ou reverter. */
  @IsOptional() @IsString() @MaxLength(20000) outcome?: string;
}

export class BuscarMudancasDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsIn(CHANGE_STATUSES) status?: ChangeStatus;
  @IsOptional() @IsIn(CHANGE_KINDS) kind?: ChangeKind;
  @IsOptional() @IsIn(CHANGE_RISKS) risk?: ChangeRisk;
  @IsOptional() @Transform(textoVirandoBooleano) @IsBoolean() abertas?: boolean;
  @IsOptional() @IsDateString() de?: string;
  @IsOptional() @IsDateString() ate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class VincularChamadoDto {
  @IsUUID() ticketId!: string;
}

export class NotaDaMudancaDto {
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;
}
