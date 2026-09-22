import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { NOTIFICACOES } from '@norty-desk/shared';

export class InscreverPushDto {
  /**
   * A URL do serviço de push do navegador.
   *
   * 2048 porque o endpoint do FCM já passa de 200 caracteres e não há
   * limite no padrão; curto demais recusaria inscrição válida.
   */
  @IsString() @MinLength(10) @MaxLength(2048) endpoint!: string;

  @IsString() @MinLength(10) @MaxLength(255) p256dh!: string;
  @IsString() @MinLength(4) @MaxLength(255) auth!: string;

  /** "Chrome no Windows", para a pessoa reconhecer o aparelho. */
  @IsOptional() @IsString() @MaxLength(120) descricao?: string;
}

export class SilenciarDto {
  @IsArray() @IsIn(NOTIFICACOES, { each: true })
  silenciados!: (typeof NOTIFICACOES)[number][];
}
