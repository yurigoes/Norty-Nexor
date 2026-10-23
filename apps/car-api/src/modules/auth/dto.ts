import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Informe a senha.' })
  @MaxLength(200)
  password!: string;
}

export class MfaDto {
  @Matches(/^\d{6}$/, { message: 'O código tem 6 dígitos.' })
  code!: string;
}

export class SelectContextDto {
  @IsString()
  @MaxLength(80)
  key!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MaxLength(200)
  newPassword!: string;
}

export class ResetRequestDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;
}

export class ResetConfirmDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  @IsString()
  @MaxLength(200)
  newPassword!: string;
}

export class MfaDisableDto {
  @IsString()
  @MaxLength(200)
  password!: string;

  @Matches(/^\d{6}$/, { message: 'O código tem 6 dígitos.' })
  code!: string;
}

export class RevokeSessionDto {
  @IsUUID()
  sessionId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
