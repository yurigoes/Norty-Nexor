import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const TIPOS = ['INCIDENTE', 'REQUISICAO'] as const;
const STATUS = [
  'NOVO', 'ATRIBUIDO', 'PLANEJADO', 'PENDENTE', 'EM_APROVACAO', 'SOLUCIONADO', 'FECHADO',
] as const;
const VISIBILIDADES = ['PUBLICA', 'INTERNA'] as const;
const CANAIS = ['WEB', 'EMAIL', 'WHATSAPP', 'API', 'SISTEMA'] as const;
const TIPOS_VINCULO = ['RELACIONADO', 'DUPLICADO_DE', 'BLOQUEIA'] as const;

/** `?status=NOVO,ATRIBUIDO` chega como texto; o filtro quer lista. */
const listaDeTexto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value;

const listaDeInteiros = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.split(',').map((v) => Number(v.trim())).filter(Number.isInteger)
    : value;

const booleano = ({ value }: { value: unknown }) => value === true || value === 'true';

export class ParteDto {
  @IsEnum(['USER', 'TEAM', 'SUPPLIER', 'CONTACT'] as const)
  kind!: 'USER' | 'TEAM' | 'SUPPLIER' | 'CONTACT';

  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
}

/**
 * `priority` não existe aqui de propósito: é derivada de urgência e
 * impacto (CLAUDE.md, regra 7). Com `forbidNonWhitelisted`, mandá-la é
 * 400 — e é isso que se quer.
 */
export class CriarChamadoDto {
  @IsString() @MinLength(3) @MaxLength(255) subject!: string;
  @IsString() @MinLength(1) description!: string;

  @IsOptional() @IsEnum(TIPOS) type?: (typeof TIPOS)[number];
  @IsOptional() @IsInt() @Min(1) @Max(5) urgency?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) impact?: number;
  @IsOptional() @IsUUID() categoryId?: string;
  /*
   * Não há `formId`: o formulário vem da categoria, resolvido pela API.
   * Aceitá-lo do cliente seria deixar alguém responder ao schema de um
   * formulário e gravar o resultado no chamado de outro.
   */

  @IsOptional() @ValidateNested() @Type(() => ParteDto) requester?: ParteDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ParteDto)
  observers?: ParteDto[];

  /**
   * As respostas do formulário da categoria.
   *
   * Sem validação de forma aqui de propósito: quem conhece o schema é o
   * `FormulariosService`, e é ele quem devolve um erro por campo em vez
   * de "requisição inválida".
   */
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class ResponderDto {
  @IsString() @MinLength(1) body!: string;

  /**
   * `INTERNA` nunca sai por canal externo. A verificação acontece de
   * novo na fila de saída — é a proteção contra o pior erro possível do
   * produto (`docs/04-rbac.md`, seção 6).
   */
  @IsOptional() @IsEnum(VISIBILIDADES) visibility?: (typeof VISIBILIDADES)[number];

  /** Omitido, responde pelo canal em que o solicitante falou. */
  @IsOptional() @IsEnum(CANAIS) channel?: (typeof CANAIS)[number];
}

export class AtribuirDto {
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() userId?: string;
}

export class ClassificarDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) urgency?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) impact?: number;
  @IsOptional() @IsEnum(TIPOS) type?: (typeof TIPOS)[number];
}

export class PausarDto {
  @IsUUID() pendingReasonId!: string;
  @IsOptional() @IsString() body?: string;
}

export class ResolverDto {
  @IsString() @MinLength(1) body!: string;
}

export class ReabrirDto {
  @IsString() @MinLength(1) body!: string;
}

export class VincularDto {
  @IsUUID() targetTicketId!: string;
  @IsEnum(TIPOS_VINCULO) type!: (typeof TIPOS_VINCULO)[number];
}

export class FiltroFilaDto {
  @IsOptional() @Transform(listaDeTexto) @IsArray() @IsEnum(STATUS, { each: true })
  status?: (typeof STATUS)[number][];

  @IsOptional() @IsEnum(TIPOS) type?: (typeof TIPOS)[number];

  @IsOptional() @Transform(listaDeInteiros) @IsArray() @IsInt({ each: true })
  priority?: number[];

  @IsOptional() @Transform(listaDeTexto) @IsArray() @IsEnum(CANAIS, { each: true })
  channel?: (typeof CANAIS)[number][];

  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() assignedTeamId?: string;

  /** Aceita `me`, que resolve para o usuário do token. */
  @IsOptional() @IsString() assignedUserId?: string;
  @IsOptional() @IsString() requesterId?: string;

  @IsOptional() @Transform(booleano) @IsBoolean() semAtribuicao?: boolean;
  @IsOptional() @Transform(booleano) @IsBoolean() slaBreached?: boolean;
  @IsOptional() @IsDateString() slaDueBefore?: string;

  @IsOptional() @IsString() @MaxLength(200) q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsString() cursor?: string;
}
