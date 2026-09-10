import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { MSG_USERNAME, USERNAME_REGEX } from '../../common/usuario';

const PAPEIS = ['SOLICITANTE', 'AGENTE', 'SUPERVISOR', 'GESTOR', 'ADMINISTRADOR'] as const;

export class CriarCategoriaDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsUUID() defaultTeamId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) defaultUrgency?: number;

  /** Os acordos que um chamado desta categoria recebe ao nascer. */
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsUUID('4', { each: true })
  defaultAgreementIds?: string[];
}

export class EditarCategoriaDto extends CriarCategoriaDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) declare name: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CriarTimeDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class EditarTimeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class MembroDoTimeDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsBoolean() isManager?: boolean;
}

export class CriarUsuarioDto {
  @IsEmail() @MaxLength(255) email!: string;
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsEnum(PAPEIS) role!: (typeof PAPEIS)[number];
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @Matches(USERNAME_REGEX, { message: MSG_USERNAME }) username?: string;
}

export class EditarUsuarioDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @IsOptional() @IsEnum(PAPEIS) role?: (typeof PAPEIS)[number];
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** `null` apaga o nome de usuário; ausente, mantém. */
  @IsOptional() @IsString() @Matches(USERNAME_REGEX, { message: MSG_USERNAME })
  username?: string | null;
}

export class CriarChaveDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;

  @IsArray() @ArrayMaxSize(12) @IsString({ each: true })
  scopes!: string[];
}

export class FiltroUsuarioDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsEnum(PAPEIS) role?: (typeof PAPEIS)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
