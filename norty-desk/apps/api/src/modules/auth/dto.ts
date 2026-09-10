import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class OrganizacaoAtivaDto {
  @IsUUID()
  organizationId!: string;
}

export class TrocarSenhaDto {
  @IsString() @MinLength(1) atual!: string;
  @IsString() @MinLength(8) @MaxLength(200) nova!: string;
}
