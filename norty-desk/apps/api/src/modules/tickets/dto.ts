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
import type { Scale } from '@norty-desk/shared';

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
  /**
   * O modelo escolhido. Omitido, o formulário vem da categoria.
   *
   * Ver `CreateTicketRequest` em packages/shared: a validação das
   * respostas passou a ser contra o formulário que vai ser gravado, e é
   * isso que torna seguro aceitar o campo.
   */
  @IsOptional() @IsUUID() formId?: string;

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

  /** O texto veio do Norty Copilot. Ver `ReplyRequest` em shared. */
  @IsOptional() @IsBoolean() aiGenerated?: boolean;
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

/**
 * O filtro da fila **sem a paginação** — o que uma busca salva guarda.
 *
 * A separação existe para que o compilador, e não um comentário, garanta
 * que a busca salva não carregue `cursor`: o corpo de
 * `POST /saved-searches` aceita este DTO, e `FiltroFilaDto` o estende.
 * Cursor guardado aponta para uma página que na semana seguinte não
 * existe; `limit` é preferência de tela, não de filtro.
 *
 * Os `@Transform` de lista servem aos dois usos: na fila o valor vem da
 * URL como `"NOVO,PENDENTE"`, e na busca salva vem do JSON já como
 * array. `listaDeTexto` aceita os dois, e é por isso que o mesmo DTO
 * valida a query string e o corpo.
 */
export class FiltroSalvavelDto {
  @IsOptional() @Transform(listaDeTexto) @IsArray() @IsEnum(STATUS, { each: true })
  status?: (typeof STATUS)[number][];

  @IsOptional() @IsEnum(TIPOS) type?: (typeof TIPOS)[number];

  /**
   * A escala é 1 a 5, e o teto importa: `priority=99` passava por
   * `@IsInt` e ia para o `where` casar com nada. Na fila isso é uma tela
   * vazia sem explicação; numa busca salva, uma aba que nunca mostra
   * nada e ninguém sabe por quê.
   */
  @IsOptional()
  @Transform(listaDeInteiros)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(5, { each: true })
  priority?: Scale[];

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
}

export class FiltroFilaDto extends FiltroSalvavelDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsString() cursor?: string;
}
