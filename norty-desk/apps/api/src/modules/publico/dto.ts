import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
}
