import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { MSG_USERNAME, USERNAME_REGEX } from '../../common/usuario';

export class LoginDto {
  /** E-mail ou nome de usuário — o serviço decide pelo "@". */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  login?: string;

  /** Nome antigo do campo, ainda aceito de clientes que o enviam. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  /** Slug da organização — obrigatório quando `login` é nome de usuário. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  organization?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class OrganizacaoAtivaDto {
  @IsUUID()
  organizationId!: string;
}

/**
 * O que a própria pessoa muda em si. Perfil e organização, não: isso é do
 * administrador. E-mail e usuário são o login, então trocá-los pede a
 * senha atual (`senhaAtual`).
 */
export class AtualizarPerfilDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  /** `null` apaga. */
  @IsOptional() @IsString() @MaxLength(32) phone?: string | null;
  /** `null` apaga — desde que sobre o nome de usuário. */
  @IsOptional() @IsEmail({}, { message: 'Informe um e-mail válido.' }) @MaxLength(255)
  email?: string | null;
  /** `null` apaga. */
  @IsOptional() @IsString() @Matches(USERNAME_REGEX, { message: MSG_USERNAME })
  username?: string | null;
  @IsOptional() @IsString() @MaxLength(200) senhaAtual?: string;
}

export class TrocarSenhaDto {
  @IsString() @MinLength(1) atual!: string;
  @IsString() @MinLength(8) @MaxLength(200) nova!: string;
}
