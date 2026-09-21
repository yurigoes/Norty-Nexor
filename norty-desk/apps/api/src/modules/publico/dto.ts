import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BuscarEmpresaDto {
  @IsString() @MaxLength(160) q!: string;
}

export class AbrirPublicoDto {
  @IsUUID() clientId!: string;

  @IsString() @MinLength(3) @MaxLength(160) requesterName!: string;

  @IsOptional() @IsEmail() requesterEmail?: string;
  @IsOptional() @IsString() @MaxLength(32) requesterPhone?: string;

  @IsString() @MinLength(3) @MaxLength(255) subject!: string;
  @IsString() @MinLength(10) @MaxLength(10000) description!: string;

  /** O tipo de chamado, que também decide para quem ele vai. */
  @IsOptional() @IsUUID() categoryId?: string;

  /** O modelo escolhido, e as respostas dos campos dele. */
  @IsOptional() @IsUUID() formId?: string;

  /**
   * As respostas são validadas contra o schema do modelo, no serviço —
   * aqui só se exige que seja um objeto. `forbidNonWhitelisted` é
   * global, e sem `@IsObject` um mapa de chaves livres seria recusado
   * antes de chegar ao validador que sabe o que esperar.
   */
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;

  /** Quem acompanha junto, por e-mail. O teto de verdade é do serviço. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  observerEmails?: string[];
}
