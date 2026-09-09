import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
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
const VISIBILIDADES = ['PUBLICA', 'INTERNA'] as const;
const CANAIS = ['WEB', 'EMAIL', 'WHATSAPP', 'API', 'SISTEMA'] as const;
const TIPOS_VINCULO = ['RELACIONADO', 'DUPLICADO_DE', 'BLOQUEIA'] as const;

export class ParteDto {
  @IsEnum(['USER', 'TEAM', 'SUPPLIER', 'CONTACT'] as const)
  kind!: 'USER' | 'TEAM' | 'SUPPLIER' | 'CONTACT';

  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
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
  @IsOptional() @IsUUID() formId?: string;

  @IsOptional() @ValidateNested() @Type(() => ParteDto) requester?: ParteDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ParteDto)
  observers?: ParteDto[];

  @IsOptional() customFields?: Record<string, unknown>;
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
  @IsOptional() @IsUUID() solutionTypeId?: string;
}

export class ReabrirDto {
  @IsString() @MinLength(1) body!: string;
}

export class VincularDto {
  @IsUUID() targetTicketId!: string;
  @IsEnum(TIPOS_VINCULO) type!: (typeof TIPOS_VINCULO)[number];
}
