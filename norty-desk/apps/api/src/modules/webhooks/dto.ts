import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class EscreverWebhookDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;

  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(500)
  url!: string;

  /**
   * O segredo do HMAC. Obrigatório na criação: webhook sem assinatura
   * é um endpoint que aceita qualquer coisa que se pareça com a gente.
   */
  @IsString() @MinLength(16) @MaxLength(200) secret!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  events!: string[];

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EditarWebhookDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['https'] }) @MaxLength(500) url?: string;
  /** Em branco preserva o que está guardado. */
  @IsOptional() @IsString() @MinLength(16) @MaxLength(200) secret?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  events?: string[];

  @IsOptional() @IsBoolean() isActive?: boolean;
}
