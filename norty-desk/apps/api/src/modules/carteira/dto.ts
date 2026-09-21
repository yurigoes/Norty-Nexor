import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const vazioVirandoNulo = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class EscreverClienteDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;

  /**
   * Domínio do e-mail da empresa, sem arroba e sem `https://`.
   *
   * É dele que sai o login de toda pessoa da empresa, então errar aqui
   * erra o login de todo mundo — por isso a forma é conferida.
   */
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      : value,
  )
  emailDomain!: string;

  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(32) document?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsEmail() contactEmail?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(32) contactPhone?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EditarClienteDto extends EscreverClienteDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) declare name: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(120) declare emailDomain: string;
}

/**
 * Uma pessoa da empresa-cliente.
 *
 * Nome completo, e-mail e WhatsApp — o login **não** se digita: sai do
 * nome mais o domínio da empresa. Pedir o login à mão seria pedir a
 * quem cadastra que acerte a mesma regra cem vezes.
 */
export class EscreverPessoaDoClienteDto {
  @IsString() @MinLength(3) @MaxLength(160) name!: string;
  /** E-mail de contato da pessoa, para onde vai o aviso. Não é o login. */
  @IsOptional() @Transform(vazioVirandoNulo) @IsEmail() contactEmail?: string | null;
  @IsOptional() @Transform(vazioVirandoNulo) @IsString() @MaxLength(32) phone?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class DefinirPinDto {
  @IsString() @MinLength(6) @MaxLength(6) pin!: string;
}
