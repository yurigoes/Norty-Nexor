import { IsString, MaxLength, MinLength } from 'class-validator';

export class DefinirSenhaDto {
  /** 32 bytes em base64url dão 43 caracteres; a folga cobre variação. */
  @IsString() @MinLength(16) @MaxLength(200) token!: string;

  /**
   * Oito caracteres, como a troca pela tela de conta.
   *
   * O mínimo mora nos dois lugares porque são duas portas para o mesmo
   * campo — e uma porta com regra mais frouxa é a que passa a ser
   * usada.
   */
  @IsString() @MinLength(8) @MaxLength(200) nova!: string;
}
