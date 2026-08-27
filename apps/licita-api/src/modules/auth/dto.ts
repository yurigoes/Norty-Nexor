import {
  IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength,
} from 'class-validator';

/**
 * A regra de senha é deliberadamente de comprimento, não de
 * composição. Exigir símbolo e maiúscula empurra o usuário para
 * "Senha@123" — curta, previsível e presente em qualquer lista de
 * vazamento. Doze caracteres livres resistem mais.
 */
const SENHA_CURTA = 'A senha precisa de ao menos 12 caracteres. Uma frase que só você lembra funciona bem.';

export class CadastrarDto {
  @IsString() @MinLength(3) @MaxLength(120)
  nome!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(180)
  email!: string;

  @IsString() @MinLength(12, { message: SENHA_CURTA }) @MaxLength(200)
  senha!: string;

  @IsString() @MinLength(3) @MaxLength(200)
  razaoSocial!: string;

  @IsOptional() @IsString() @MaxLength(120)
  nomeFantasia?: string;

  @IsString() @Matches(/^\D*(\d\D*){14}$/, { message: 'CNPJ deve ter 14 dígitos.' })
  cnpj!: string;

  @IsString() @Length(2, 2, { message: 'UF deve ter duas letras.' })
  uf!: string;

  @IsString() @Matches(/^\d{7}$/, { message: 'Código IBGE do município deve ter 7 dígitos.' })
  municipioIbge!: string;
}

export class EntrarDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;

  @IsString() @MaxLength(200)
  senha!: string;
}

export class EmailDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;
}

export class TokenDto {
  @IsString() @MinLength(20) @MaxLength(200)
  token!: string;
}

export class RedefinirDto {
  @IsString() @MinLength(20) @MaxLength(200)
  token!: string;

  @IsString() @MinLength(12, { message: SENHA_CURTA }) @MaxLength(200)
  senha!: string;
}
