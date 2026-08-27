import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(180)
  email!: string;

  @IsString()
  @MinLength(6, { message: 'A senha precisa ter ao menos 6 caracteres.' })
  @MaxLength(200)
  password!: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'A nova senha precisa ter ao menos 8 caracteres.' })
  @MaxLength(200)
  newPassword!: string;
}
