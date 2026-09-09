import { IsEmail, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

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
